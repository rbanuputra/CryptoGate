import type { Candle, IndicatorSnapshot } from "../types/candle.js";

/** Simple moving average; result[i] is the SMA ending at i (NaN until enough data). */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average seeded with the first value. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0]!;
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RMA (used by ATR / RSI / ADX). */
function rma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out[i] = prev;
  }
  return out;
}

export function trueRange(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i === 0) {
      out[i] = c.high - c.low;
      continue;
    }
    const pc = candles[i - 1]!.close;
    out[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  return out;
}

export function atr(candles: Candle[], period = 14): number[] {
  return rma(trueRange(candles), period);
}

export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }
  const avgGain = rma(gains, period);
  const avgLoss = rma(losses, period);
  for (let i = 0; i < closes.length; i++) {
    const g = avgGain[i]!;
    const l = avgLoss[i]!;
    if (Number.isNaN(g) || Number.isNaN(l)) continue;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export interface BollingerBand {
  upper: number;
  middle: number;
  lower: number;
  width: number;
}

export function bollinger(closes: number[], period = 20, stdMult = 2): BollingerBand[] {
  const mid = sma(closes, period);
  const out: BollingerBand[] = [];
  for (let i = 0; i < closes.length; i++) {
    const m = mid[i]!;
    if (Number.isNaN(m)) {
      out.push({ upper: NaN, middle: NaN, lower: NaN, width: NaN });
      continue;
    }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j]! - m) ** 2;
    const sd = Math.sqrt(variance / period);
    const upper = m + stdMult * sd;
    const lower = m - stdMult * sd;
    out.push({ upper, middle: m, lower, width: m !== 0 ? (upper - lower) / m : NaN });
  }
  return out;
}

/** Average Directional Index (Wilder). Returns the ADX series. */
export function adx(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < period + 1) return out;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [candles[0]!.high - candles[0]!.low];
  for (let i = 1; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    const up = c.high - p.high;
    const down = p.low - c.low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const trN = rma(tr, period);
  const plusN = rma(plusDM, period);
  const minusN = rma(minusDM, period);
  const dx: number[] = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const t = trN[i]!;
    if (Number.isNaN(t) || t === 0) continue;
    const pdi = 100 * (plusN[i]! / t);
    const mdi = 100 * (minusN[i]! / t);
    const denom = pdi + mdi;
    dx[i] = denom === 0 ? 0 : 100 * (Math.abs(pdi - mdi) / denom);
  }
  // ADX = RMA of DX over period (only over valid DX region)
  const firstValid = dx.findIndex((v) => !Number.isNaN(v));
  if (firstValid < 0) return out;
  const dxValid = dx.slice(firstValid).map((v) => (Number.isNaN(v) ? 0 : v));
  const adxValid = rma(dxValid, period);
  for (let i = 0; i < adxValid.length; i++) out[firstValid + i] = adxValid[i]!;
  return out;
}

/** Session VWAP: cumulative(typical*vol)/cumulative(vol) since session open (00:00 UTC each day). */
export function vwap(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  let cumPV = 0;
  let cumV = 0;
  let curDay = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const day = Math.floor(c.openTime / 86_400_000);
    if (day !== curDay) {
      curDay = day;
      cumPV = 0;
      cumV = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    out[i] = cumV > 0 ? cumPV / cumV : c.close;
  }
  return out;
}

export interface PivotFlags {
  isHigh: boolean;
  isLow: boolean;
}

/** Pivot high/low centered at i, confirmed only after `right` more bars exist. */
export function pivots(highs: number[], lows: number[], left: number, right: number): PivotFlags[] {
  const n = highs.length;
  const out: PivotFlags[] = Array.from({ length: n }, () => ({ isHigh: false, isLow: false }));
  for (let i = left; i < n - right; i++) {
    const h = highs[i]!;
    const l = lows[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (highs[j]! >= h) isHigh = false;
      if (lows[j]! <= l) isLow = false;
    }
    out[i] = { isHigh, isLow };
  }
  return out;
}

function lastReal(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!Number.isNaN(arr[i]!)) return arr[i]!;
  }
  return NaN;
}

/** Compute a full indicator snapshot for the latest candle. */
export function computeIndicators(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const atrArr = atr(candles, 14);
  const bb = bollinger(closes, 20, 2);
  const lastBB = bb[bb.length - 1] ?? { upper: NaN, middle: NaN, lower: NaN, width: NaN };
  const vwapArr = vwap(candles);
  return {
    atr14: lastReal(atrArr),
    ema20: lastReal(ema(closes, 20)),
    ema50: lastReal(ema(closes, 50)),
    ema200: lastReal(ema(closes, 200)),
    adx14: lastReal(adx(candles, 14)),
    rsi14: lastReal(rsi(closes, 14)),
    bbUpper: lastBB.upper,
    bbMiddle: lastBB.middle,
    bbLower: lastBB.lower,
    bbWidth: lastBB.width,
    vwap: lastReal(vwapArr),
    volumeSMA20: lastReal(sma(vols, 20)),
    atrSMA100: lastReal(sma(atrArr.map((v) => (Number.isNaN(v) ? 0 : v)), 100)),
  };
}
