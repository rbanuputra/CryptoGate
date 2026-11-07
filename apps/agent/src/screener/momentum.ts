/**
 * Module 2 — Layer 2: Momentum Scanner.
 * Ranks watchlist coins by a 0-1 composite momentum score so the agent flows
 * to the hottest opportunities. Pure: feed it per-coin metrics.
 */
import { clamp, type MomentumScore } from "@cryptogate/shared";

export interface MomentumInput {
  symbol: string;
  /** signed % change over last 4h as a fraction (e.g. 0.03 = +3%) */
  priceChange4h: number;
  /** current 15m volume / SMA(volume,20) */
  volumeRatio: number;
  /** current ATR / SMA(ATR,100) */
  atrRatio: number;
  /** signed % change in OI over last 4h as a fraction */
  oiChange4h: number;
  /** 4h ADX */
  adx: number;
  /** 15m Bollinger width (fraction of price) */
  bbWidth: number;
}

export function calculateMomentumScore(input: MomentumInput): MomentumScore {
  const absPrice = Math.abs(input.priceChange4h);
  const priceScore =
    absPrice > 0.08 ? 0.5 : absPrice > 0.02 ? 1.0 : absPrice > 0.005 ? 0.4 : 0.1;

  const volumeScore = clamp(input.volumeRatio / 3.0, 0, 1.0);
  const atrScore = clamp(input.atrRatio / 2.0, 0, 1.0);

  const absOi = Math.abs(input.oiChange4h);
  const oiScore = absOi > 0.05 ? 1.0 : absOi > 0.02 ? 0.6 : 0.2;

  const adxPart = input.adx > 30 ? 1.0 : input.adx > 25 ? 0.7 : 0.3;
  const squeezeBonus = input.bbWidth < 0.02 ? 1.2 : 1.0;
  const clarityScore = adxPart * squeezeBonus;

  const score =
    priceScore * 0.3 +
    volumeScore * 0.25 +
    atrScore * 0.2 +
    oiScore * 0.15 +
    clarityScore * 0.1;

  return {
    symbol: input.symbol,
    score: Number(score.toFixed(4)),
    priceChange4h: input.priceChange4h,
    volumeSpike: input.volumeRatio,
    atrExpansion: input.atrRatio,
    oiChange4h: input.oiChange4h,
    regimeClarity: Number(clarityScore.toFixed(4)),
  };
}

/** Top-N hottest coins (default 8). */
export function getActiveScanList(scores: MomentumScore[], topN = 8): MomentumScore[] {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, topN);
}
