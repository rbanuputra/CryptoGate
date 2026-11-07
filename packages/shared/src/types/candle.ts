export type Timeframe = "1m" | "15m" | "4h" | "1d";

export interface Candle {
  /** open time, epoch ms */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** close time, epoch ms (optional; derivable from timeframe) */
  closeTime?: number;
}

export interface IndicatorSnapshot {
  atr14: number;
  ema20: number;
  ema50: number;
  ema200: number;
  adx14: number;
  rsi14: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  vwap: number;
  volumeSMA20: number;
  /** rolling ATR average (for regime/ATR-expansion) */
  atrSMA100: number;
}

export const TF_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "15m": 900_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};
