import {
  computeIndicators,
  type Candle,
  type IndicatorSnapshot,
  type Timeframe,
} from "@cryptogate/shared";

/** Circular candle buffer that recomputes indicators on each closed candle. */
export class CandleBuffer {
  private candles: Candle[] = [];
  indicators: IndicatorSnapshot | null = null;

  constructor(
    readonly symbol: string,
    readonly timeframe: Timeframe,
    readonly maxLen = 1500,
  ) {}

  seed(candles: Candle[]): void {
    this.candles = candles.slice(-this.maxLen);
    this.recompute();
  }

  /** Upsert by openTime; recompute indicators when a candle closes. */
  update(candle: Candle, closed: boolean): void {
    const last = this.candles[this.candles.length - 1];
    if (last && last.openTime === candle.openTime) {
      this.candles[this.candles.length - 1] = candle;
    } else if (!last || candle.openTime > last.openTime) {
      this.candles.push(candle);
      if (this.candles.length > this.maxLen) this.candles.shift();
    }
    if (closed) this.recompute();
  }

  private recompute(): void {
    if (this.candles.length >= 20) this.indicators = computeIndicators(this.candles);
  }

  all(): readonly Candle[] {
    return this.candles;
  }
  get length(): number {
    return this.candles.length;
  }
  last(): Candle | undefined {
    return this.candles[this.candles.length - 1];
  }
}
