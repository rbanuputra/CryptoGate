/**
 * Strategy 2: Momentum Breakout.
 * Active in TRENDING_UP / TRENDING_DOWN / HIGH_VOLATILITY.
 * Breakout of a 4H key level on the 15M chart, confirmed by volume, ADX and a
 * strong candle body, aligned with the 4H EMA trend.
 */
import { adx, atr, ema, pivots, sma, type Candle, type Signal } from "@cryptogate/shared";
import type { ScanContext, Strategy } from "./base.js";
import { buildSignal, lastReal } from "./util.js";

export interface MomentumConfig {
  volumeMultBreakout: number;
  volumeMultHighConviction: number;
  bodyAtrMult: number;
  adxMin: number;
  slBufferAtr: number;
  tp1Rr: number;
  tp2Rr: number;
}

export const MOMENTUM_DEFAULT: MomentumConfig = {
  volumeMultBreakout: 2.0,
  volumeMultHighConviction: 3.0,
  bodyAtrMult: 1.5,
  adxMin: 25,
  slBufferAtr: 0.5,
  tp1Rr: 1.5,
  tp2Rr: 3.0,
};

/** Recent 4H pivot highs/lows as horizontal key levels. */
function keyLevels(htf: Candle[], swing = 5): { highs: number[]; lows: number[] } {
  const flags = pivots(htf.map((c) => c.high), htf.map((c) => c.low), swing, swing);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 0; i < htf.length; i++) {
    if (flags[i]!.isHigh) highs.push(htf[i]!.high);
    if (flags[i]!.isLow) lows.push(htf[i]!.low);
  }
  return { highs: highs.slice(-20), lows: lows.slice(-20) };
}

export class MomentumBreakoutStrategy implements Strategy {
  readonly name = "momentum_breakout" as const;
  constructor(private readonly cfg: MomentumConfig = MOMENTUM_DEFAULT) {}

  scan(ctx: ScanContext): Signal[] {
    const { chart, htf } = ctx;
    const n = chart.length;
    if (n < 30 || htf.length < 20) return [];
    const L = n - 1;
    const cur = chart[L]!;
    const prev = chart[L - 1]!;

    const a = lastReal(atr(chart, 14));
    const adxNow = lastReal(adx(chart, 14));
    const volSma = lastReal(sma(chart.map((c) => c.volume), 20));
    if (!(a > 0) || !(volSma > 0)) return [];

    const ema20h = lastReal(ema(htf.map((c) => c.close), 20));
    const ema50h = lastReal(ema(htf.map((c) => c.close), 50));
    const trendUp = ema20h > ema50h;

    const body = Math.abs(cur.close - cur.open);
    const volRatio = cur.volume / volSma;
    const strong = body > this.cfg.bodyAtrMult * a && adxNow > this.cfg.adxMin && volRatio > this.cfg.volumeMultBreakout;
    if (!strong) return [];

    const { highs, lows } = keyLevels(htf);
    const cfg = this.cfg;
    const conviction = volRatio > cfg.volumeMultHighConviction ? 0.8 : 0.6;

    // LONG: fresh close above a resistance, aligned with up-trend
    if (trendUp && cur.close > cur.open) {
      const lvl = highs.filter((h) => prev.close <= h && cur.close > h).sort((x, y) => y - x)[0];
      if (lvl !== undefined) {
        const sl = lvl - a * cfg.slBufferAtr;
        const sig = buildSignal({
          strategy: "momentum_breakout", symbol: ctx.symbol, direction: "long",
          entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
          confidence: conviction, regime: ctx.regime.regime,
          reasoning: `Break above ${lvl.toPrecision(6)} vol ${volRatio.toFixed(1)}x adx ${adxNow.toFixed(0)}`,
          timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs, meta: { level: lvl },
        });
        return sig ? [sig] : [];
      }
    }
    // SHORT: fresh close below a support, aligned with down-trend
    if (!trendUp && cur.close < cur.open) {
      const lvl = lows.filter((l) => prev.close >= l && cur.close < l).sort((x, y) => x - y)[0];
      if (lvl !== undefined) {
        const sl = lvl + a * cfg.slBufferAtr;
        const sig = buildSignal({
          strategy: "momentum_breakout", symbol: ctx.symbol, direction: "short",
          entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
          confidence: conviction, regime: ctx.regime.regime,
          reasoning: `Break below ${lvl.toPrecision(6)} vol ${volRatio.toFixed(1)}x adx ${adxNow.toFixed(0)}`,
          timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs, meta: { level: lvl },
        });
        return sig ? [sig] : [];
      }
    }
    return [];
  }
}
