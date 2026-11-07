/**
 * Strategy 1: SMC Sweep
 * Liquidity sweep -> displacement -> OB/FVG zone retest, with HTF liquidity
 * context and optional CHoCH/BOS structure + session filters.
 *
 * Ported from the validated Python backtest engine. Pure, side-effect-free:
 * `detectSmcSignals` scans full chart+HTF series and returns every signal with
 * the bar index it fires on; a live scanner or backtester decides execution.
 */
import { atr, pivots, sessionOf, TF_MS, type Candle, type Timeframe } from "@cryptogate/shared";

export interface SmcConfig {
  displacementMult: number;
  sweepWickMin: number;
  slBuffer: number;
  tp1Rr: number;
  tp2Rr: number;
  cooldownBars: number;
  chochRequired: boolean;
  zoneMaxAge: number;
  swingLen: number;
  sweepLookback: number;
  obEnabled: boolean;
  fvgEnabled: boolean;
  sessionFilter: boolean;
}

/** Optimized defaults from the SMC backtest (per PRD). */
export const SMC_DEFAULT: SmcConfig = {
  displacementMult: 1.8,
  sweepWickMin: 0.3,
  slBuffer: 0.3,
  tp1Rr: 1.5,
  tp2Rr: 4.0,
  cooldownBars: 3,
  chochRequired: true,
  zoneMaxAge: 50,
  swingLen: 5,
  sweepLookback: 20,
  obEnabled: true,
  fvgEnabled: true,
  sessionFilter: true,
};

export type Dir = "long" | "short";
export type ZoneKind = "OB" | "FVG";

export interface SmcSignal {
  barIndex: number;
  timestamp: number;
  direction: Dir;
  entryType: "market";
  slPrice: number;
  sweptLevel: number;
  sweptWick: number;
  zoneKind: ZoneKind;
  zoneTop: number;
  zoneBot: number;
  atr: number;
  confidence: number;
  reasoning: string;
}

interface Zone {
  kind: ZoneKind;
  side: "bull" | "bear";
  top: number;
  bottom: number;
  born: number;
}
interface Level {
  price: number;
  swept: boolean;
}
interface Sweep {
  bar: number;
  wick: number;
  level: number;
}

/** HTF pivots -> availability events on the chart timeline (confirmed only). */
function buildHtfLevelEvents(
  htf: Candle[],
  htfTf: Timeframe,
  swingLen: number,
): Array<{ avail: number; side: "bsl" | "ssl"; price: number }> {
  const highs = htf.map((c) => c.high);
  const lows = htf.map((c) => c.low);
  const flags = pivots(highs, lows, swingLen, swingLen);
  const dur = TF_MS[htfTf];
  const events: Array<{ avail: number; side: "bsl" | "ssl"; price: number }> = [];
  for (let i = 0; i < htf.length; i++) {
    const confirm = i + swingLen;
    if (confirm >= htf.length) continue;
    const avail = htf[confirm]!.openTime + dur; // close time of confirming bar
    if (flags[i]!.isHigh) events.push({ avail, side: "ssl", price: highs[i]! });
    if (flags[i]!.isLow) events.push({ avail, side: "bsl", price: lows[i]! });
  }
  events.sort((a, b) => a.avail - b.avail);
  return events;
}

export function detectSmcSignals(
  chart: Candle[],
  htf: Candle[],
  htfTf: Timeframe,
  cfg: SmcConfig = SMC_DEFAULT,
): SmcSignal[] {
  const n = chart.length;
  const signals: SmcSignal[] = [];
  if (n < 60) return signals;

  const atrArr = atr(chart, 14);
  const highs = chart.map((c) => c.high);
  const lows = chart.map((c) => c.low);
  const pv = pivots(highs, lows, cfg.swingLen, cfg.swingLen);

  const events = buildHtfLevelEvents(htf, htfTf, cfg.swingLen);
  let evIdx = 0;
  const bsl: Level[] = [];
  const ssl: Level[] = [];

  let zones: Zone[] = [];
  let lastBull: Sweep = { bar: -1e9, wick: NaN, level: NaN };
  let lastBear: Sweep = { bar: -1e9, wick: NaN, level: NaN };
  let trend = 0;
  let lastBullStruct = -1e9;
  let lastBearStruct = -1e9;
  let lastPhVal: number | null = null;
  let lastPlVal: number | null = null;
  let lastSignalBar = -1e9;

  for (let i = 0; i < n; i++) {
    const c = chart[i]!;
    const ts = c.openTime;
    let a = atrArr[i]!;
    if (Number.isNaN(a) || a <= 0) a = Math.max(c.close * 0.0005, 1e-9);

    // 1. refresh confirmed HTF liquidity pool
    while (evIdx < events.length && events[evIdx]!.avail <= ts) {
      const ev = events[evIdx]!;
      const pool = ev.side === "bsl" ? bsl : ssl;
      const dup = pool.some(
        (x) => !x.swept && Math.abs(ev.price - x.price) / Math.max(ev.price, 1e-9) < 0.001,
      );
      if (!dup) {
        pool.push({ price: ev.price, swept: false });
        if (pool.length > 10) pool.shift();
      }
      evIdx++;
    }

    // 2. sweep detection
    for (const lv of bsl) {
      if (!lv.swept && lv.price - c.low >= cfg.sweepWickMin * a && c.close > lv.price) {
        lv.swept = true;
        lastBull = { bar: i, wick: c.low, level: lv.price };
      }
    }
    for (const lv of ssl) {
      if (!lv.swept && c.high - lv.price >= cfg.sweepWickMin * a && c.close < lv.price) {
        lv.swept = true;
        lastBear = { bar: i, wick: c.high, level: lv.price };
      }
    }

    // 3. age / mitigate existing zones
    zones = zones.filter((z) => {
      if (i - z.born > cfg.zoneMaxAge) return false;
      if (z.side === "bull" && c.low < z.bottom) return false;
      if (z.side === "bear" && c.high > z.top) return false;
      return true;
    });

    // 4. entry signal
    const inSession = !cfg.sessionFilter || sessionOf(ts) !== "off";
    const cooldownOk = i - lastSignalBar >= cfg.cooldownBars;
    if (i >= 50 && inSession && cooldownOk) {
      // LONG
      const recentBull = i - lastBull.bar <= cfg.sweepLookback;
      const structLong = trend === 1 || i - lastBullStruct <= cfg.sweepLookback;
      if (recentBull && (structLong || !cfg.chochRequired)) {
        const z = retestZone(zones, "bull", c);
        if (z) {
          const sl = lastBull.wick - a * cfg.slBuffer;
          signals.push(makeSignal(i, ts, "long", sl, lastBull, z, a,
            `BSL swept @ ${fmt(lastBull.level)}, ${z.kind} retest ${fmt(z.bottom)}-${fmt(z.top)}`));
          lastSignalBar = i;
        }
      }
      // SHORT (only if no long fired this bar)
      if (lastSignalBar !== i) {
        const recentBear = i - lastBear.bar <= cfg.sweepLookback;
        const structShort = trend === -1 || i - lastBearStruct <= cfg.sweepLookback;
        if (recentBear && (structShort || !cfg.chochRequired)) {
          const z = retestZone(zones, "bear", c);
          if (z) {
            const sl = lastBear.wick + a * cfg.slBuffer;
            signals.push(makeSignal(i, ts, "short", sl, lastBear, z, a,
              `SSL swept @ ${fmt(lastBear.level)}, ${z.kind} retest ${fmt(z.bottom)}-${fmt(z.top)}`));
            lastSignalBar = i;
          }
        }
      }
    }

    // 5. detect new zones for future bars
    const body = Math.abs(c.close - c.open);
    const bullDisp = body > cfg.displacementMult * a && c.close > c.open;
    const bearDisp = body > cfg.displacementMult * a && c.close < c.open;
    if (cfg.obEnabled) {
      if (bullDisp) {
        for (let k = i - 1; k >= Math.max(i - 5, 0); k--) {
          if (chart[k]!.close < chart[k]!.open) {
            zones.push({ kind: "OB", side: "bull", top: chart[k]!.high, bottom: chart[k]!.low, born: i });
            break;
          }
        }
      }
      if (bearDisp) {
        for (let k = i - 1; k >= Math.max(i - 5, 0); k--) {
          if (chart[k]!.close > chart[k]!.open) {
            zones.push({ kind: "OB", side: "bear", top: chart[k]!.high, bottom: chart[k]!.low, born: i });
            break;
          }
        }
      }
    }
    if (cfg.fvgEnabled && i >= 2) {
      const c2 = chart[i - 2]!;
      const c1 = chart[i - 1]!;
      if (c.low > c2.high && c1.close > c1.open) {
        zones.push({ kind: "FVG", side: "bull", top: c.low, bottom: c2.high, born: i });
      }
      if (c.high < c2.low && c1.close < c1.open) {
        zones.push({ kind: "FVG", side: "bear", top: c.high, bottom: c2.low, born: i });
      }
    }

    // 6. structure (pivot centered at i - swingLen)
    const center = i - cfg.swingLen;
    if (center >= 0) {
      if (pv[center]!.isHigh) {
        const v = highs[center]!;
        if (lastPhVal !== null && v > lastPhVal) {
          trend = 1;
          lastBullStruct = i;
        }
        lastPhVal = v;
      }
      if (pv[center]!.isLow) {
        const v = lows[center]!;
        if (lastPlVal !== null && v < lastPlVal) {
          trend = -1;
          lastBearStruct = i;
        }
        lastPlVal = v;
      }
    }
  }
  return signals;
}

function retestZone(zones: Zone[], side: "bull" | "bear", c: Candle): Zone | null {
  let best: Zone | null = null;
  for (const z of zones) {
    if (z.side !== side) continue;
    if (side === "bull") {
      if (c.low <= z.top && c.close > z.bottom && c.close > c.open) {
        if (!best || z.top > best.top) best = z;
      }
    } else {
      if (c.high >= z.bottom && c.close < z.top && c.close < c.open) {
        if (!best || z.bottom < best.bottom) best = z;
      }
    }
  }
  return best;
}

function makeSignal(
  i: number, ts: number, direction: Dir, sl: number,
  sweep: Sweep, z: Zone, a: number, reasoning: string,
): SmcSignal {
  return {
    barIndex: i, timestamp: ts, direction, entryType: "market",
    slPrice: sl, sweptLevel: sweep.level, sweptWick: sweep.wick,
    zoneKind: z.kind, zoneTop: z.top, zoneBot: z.bottom, atr: a,
    confidence: z.kind === "OB" ? 0.7 : 0.6, reasoning,
  };
}

function fmt(x: number): string {
  return x >= 100 ? x.toFixed(2) : x.toPrecision(5);
}
