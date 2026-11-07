/**
 * Strategy 5: VWAP Bounce.
 * Active in TRENDING_UP / TRENDING_DOWN. Price pulls back to the session VWAP
 * in the direction of the 4H trend and rejects with a wick + volume confirmation.
 */
import { atr, ema, sma, vwap, type Candle, type Signal } from "@cryptogate/shared";
import type { ScanContext, Strategy } from "./base.js";
import { buildSignal, lastReal } from "./util.js";

export interface VwapConfig {
  touchToleranceAtr: number;
  rejectionWickBodyRatio: number;
  volumeConfirmationMult: number;
  maxVwapCrosses: number;
  minSessionAgeBars: number;
  slBeyondVwapAtr: number;
  tp1Rr: number;
  tp2Rr: number;
}

export const VWAP_DEFAULT: VwapConfig = {
  touchToleranceAtr: 0.3,
  rejectionWickBodyRatio: 2.0,
  volumeConfirmationMult: 1.2,
  maxVwapCrosses: 3,
  minSessionAgeBars: 2,
  slBeyondVwapAtr: 0.5,
  tp1Rr: 1.5,
  tp2Rr: 2.5,
};

export class VwapBounceStrategy implements Strategy {
  readonly name = "vwap_bounce" as const;
  constructor(private readonly cfg: VwapConfig = VWAP_DEFAULT) {}

  scan(ctx: ScanContext): Signal[] {
    const { chart, htf } = ctx;
    const n = chart.length;
    const cfg = this.cfg;
    if (n < 30 || htf.length < 50) return [];
    const L = n - 1;
    const cur = chart[L]!;

    const a = lastReal(atr(chart, 14));
    const vw = vwap(chart);
    const vwNow = vw[L]!;
    const volSma = lastReal(sma(chart.map((c) => c.volume), 20));
    if (!(a > 0) || !(volSma > 0) || Number.isNaN(vwNow)) return [];

    // session age (bars since UTC midnight) and chop guard (VWAP crosses in last 8 bars)
    const day = Math.floor(cur.openTime / 86_400_000);
    let sessionAge = 0;
    for (let i = L; i >= 0 && Math.floor(chart[i]!.openTime / 86_400_000) === day; i--) sessionAge++;
    if (sessionAge < cfg.minSessionAgeBars) return [];
    let crosses = 0;
    for (let i = Math.max(1, L - 8); i <= L; i++) {
      const prevSide = Math.sign(chart[i - 1]!.close - vw[i - 1]!);
      const curSide = Math.sign(chart[i]!.close - vw[i]!);
      if (prevSide !== 0 && curSide !== 0 && prevSide !== curSide) crosses++;
    }
    if (crosses > cfg.maxVwapCrosses) return [];

    const ema20h = lastReal(ema(htf.map((c) => c.close), 20));
    const ema50h = lastReal(ema(htf.map((c) => c.close), 50));
    const body = Math.abs(cur.close - cur.open) || 1e-9;
    const lowerWick = Math.min(cur.open, cur.close) - cur.low;
    const upperWick = cur.high - Math.max(cur.open, cur.close);
    const volRatio = cur.volume / volSma;
    const tol = cfg.touchToleranceAtr * a;

    // LONG: up-trend, close above VWAP, dipped to VWAP, bullish rejection wick + volume
    if (
      ema20h > ema50h && cur.close > vwNow && cur.close > cur.open &&
      cur.low <= vwNow + tol && lowerWick > cfg.rejectionWickBodyRatio * body &&
      volRatio > cfg.volumeConfirmationMult
    ) {
      const sl = vwNow - a * cfg.slBeyondVwapAtr;
      const sig = buildSignal({
        strategy: "vwap_bounce", symbol: ctx.symbol, direction: "long",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
        confidence: 0.68, regime: ctx.regime.regime,
        reasoning: `VWAP bounce (long) @ ${vwNow.toPrecision(6)}, wick ${(lowerWick / body).toFixed(1)}x body, vol ${volRatio.toFixed(1)}x`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs, meta: { vwap: vwNow },
      });
      return sig ? [sig] : [];
    }
    // SHORT: down-trend, close below VWAP, rallied to VWAP, bearish rejection wick + volume
    if (
      ema20h < ema50h && cur.close < vwNow && cur.close < cur.open &&
      cur.high >= vwNow - tol && upperWick > cfg.rejectionWickBodyRatio * body &&
      volRatio > cfg.volumeConfirmationMult
    ) {
      const sl = vwNow + a * cfg.slBeyondVwapAtr;
      const sig = buildSignal({
        strategy: "vwap_bounce", symbol: ctx.symbol, direction: "short",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
        confidence: 0.68, regime: ctx.regime.regime,
        reasoning: `VWAP bounce (short) @ ${vwNow.toPrecision(6)}, wick ${(upperWick / body).toFixed(1)}x body, vol ${volRatio.toFixed(1)}x`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs, meta: { vwap: vwNow },
      });
      return sig ? [sig] : [];
    }
    return [];
  }
}
