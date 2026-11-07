/**
 * Module 3: Regime Detector — composite-score method (no ML yet).
 * Classifies on each 15M close using 4H trend + 15M volatility/volume.
 */
import {
  adx,
  bollinger,
  ema,
  atr,
  sma,
  MarketRegime,
  type Candle,
  type RegimeResult,
} from "@cryptogate/shared";

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}
function lastReal(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) if (!Number.isNaN(arr[i]!)) return arr[i]!;
  return NaN;
}

export function detectRegime(candles4h: Candle[], candles15m: Candle[]): RegimeResult {
  const closes4h = candles4h.map((c) => c.close);
  const ema20 = ema(closes4h, 20);
  const ema50 = ema(closes4h, 50);
  const adx4h = lastReal(adx(candles4h, 14));

  const e20 = lastReal(ema20);
  const e50 = lastReal(ema50);
  const close4h = last(candles4h)?.close ?? 0;

  // EMA slope over last ~10 bars
  const idx = ema20.length - 1;
  const prevIdx = Math.max(0, idx - 10);
  const emaSlope = ema20[prevIdx]! !== 0 ? (ema20[idx]! - ema20[prevIdx]!) / Math.abs(ema20[prevIdx]!) : 0;
  const priceVsEma = e50 !== 0 ? (close4h - e50) / e50 : 0;

  // 15M volatility
  const atr15 = atr(candles15m, 14);
  const atrNow = lastReal(atr15);
  const atrAvg = lastReal(sma(atr15.map((v) => (Number.isNaN(v) ? 0 : v)), 100));
  const atrRatio = atrAvg > 0 ? atrNow / atrAvg : 1;

  const bb = bollinger(candles15m.map((c) => c.close), 20, 2);
  const bbWidths = bb.map((b) => b.width).filter((w) => !Number.isNaN(w));
  const bbWidthNow = last(bbWidths) ?? NaN;
  const bbWidthPct = percentileRank(bbWidths.slice(-100), bbWidthNow);

  let regime: MarketRegime;
  let trendDirection: 1 | -1 | 0 = emaSlope > 0 ? 1 : emaSlope < 0 ? -1 : 0;

  if (adx4h > 30 && emaSlope > 0.005 && priceVsEma > 0.01) {
    regime = MarketRegime.TRENDING_UP;
    trendDirection = 1;
  } else if (adx4h > 30 && emaSlope < -0.005 && priceVsEma < -0.01) {
    regime = MarketRegime.TRENDING_DOWN;
    trendDirection = -1;
  } else if (atrRatio > 1.8 || bbWidthPct > 90) {
    regime = MarketRegime.HIGH_VOLATILITY;
  } else if (adx4h < 20 && bbWidthPct < 30) {
    regime = MarketRegime.LOW_VOLATILITY;
  } else if (adx4h < 25 && atrRatio < 1.2) {
    regime = MarketRegime.RANGING;
  } else {
    regime = emaSlope > 0 ? MarketRegime.TRENDING_UP : MarketRegime.TRENDING_DOWN;
  }

  // confidence: how decisively ADX + slope agree
  const adxConf = Math.min(adx4h / 40, 1);
  const slopeConf = Math.min(Math.abs(emaSlope) / 0.02, 1);
  const confidence = Number((0.5 * adxConf + 0.5 * slopeConf).toFixed(3));

  return {
    regime,
    confidence,
    trendDirection,
    volatilityLevel: Number(atrRatio.toFixed(3)),
    adx: Number((Number.isNaN(adx4h) ? 0 : adx4h).toFixed(2)),
    timestamp: last(candles15m)?.openTime ?? Date.now(),
  };
}

function percentileRank(arr: number[], value: number): number {
  if (arr.length === 0 || Number.isNaN(value)) return 50;
  const below = arr.filter((v) => v <= value).length;
  return (below / arr.length) * 100;
}
