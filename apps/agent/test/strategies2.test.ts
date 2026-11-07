import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type Candle, type RegimeResult } from "@cryptogate/shared";
import type { ScanContext } from "../src/strategies/base.js";
import { MomentumBreakoutStrategy } from "../src/strategies/momentum-breakout.js";
import { MeanReversionStrategy } from "../src/strategies/mean-reversion.js";
import { VwapBounceStrategy } from "../src/strategies/vwap-bounce.js";

const STEP = 900_000;
const T0 = 1_700_006_400_000; // a UTC midnight (divisible by 86_400_000)

function regime(r: MarketRegime): RegimeResult {
  return { regime: r, confidence: 0.8, trendDirection: 1, volatilityLevel: 1, adx: 32, timestamp: 0 };
}
function ctx(chart: Candle[], htf: Candle[], r: MarketRegime): ScanContext {
  return { symbol: "BTCUSDT", chart, htf, htfTf: "4h", regime: regime(r), signalTtlMs: 1_800_000 };
}
/** Rising HTF so EMA20 > EMA50 (uptrend). Optional isolated pivot high level. */
function htfUp(pivotHighAt?: number, pivotHighVal?: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    const close = 90 + i * 0.15;
    let high = close + 0.2;
    if (pivotHighAt !== undefined && i === pivotHighAt) high = pivotHighVal!;
    out.push({ openTime: T0 + i * 14_400_000, open: close - 0.1, high, low: close - 0.3, close, volume: 1000 });
  }
  return out;
}
function htfDown(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    const close = 110 - i * 0.15;
    out.push({ openTime: T0 + i * 14_400_000, open: close + 0.1, high: close + 0.3, low: close - 0.2, close, volume: 1000 });
  }
  return out;
}

test("momentum breakout fires a long on a volume+body break above a 4H level", () => {
  const chart: Candle[] = [];
  for (let i = 0; i < 59; i++) {
    const close = 97 + i * 0.05;
    chart.push({ openTime: T0 + i * STEP, open: close - 0.02, high: close + 0.05, low: close - 0.07, close, volume: 1000 });
  }
  // breakout bar closes above the 4H pivot-high level (=100)
  chart.push({ openTime: T0 + 59 * STEP, open: 99.9, high: 100.9, low: 99.85, close: 100.7, volume: 2600 });
  const htf = htfUp(30, 100);
  const strat = new MomentumBreakoutStrategy({
    volumeMultBreakout: 2.0, volumeMultHighConviction: 3.0, bodyAtrMult: 1.5,
    adxMin: 20, slBufferAtr: 0.5, tp1Rr: 1.5, tp2Rr: 3.0,
  });
  const sigs = strat.scan(ctx(chart, htf, MarketRegime.TRENDING_UP));
  assert.equal(sigs.length, 1, JSON.stringify(sigs));
  assert.equal(sigs[0]!.direction, "long");
  assert.ok(sigs[0]!.stopLoss < sigs[0]!.entryPrice);
});

test("mean reversion fires a long at an oversold range bottom", () => {
  const chart: Candle[] = [];
  for (let i = 0; i < 112; i++) {
    const close = 100 + 1.5 * Math.sin(i / 3);
    chart.push({ openTime: T0 + i * STEP, open: close, high: close + 0.3, low: close - 0.3, close, volume: 1000 });
  }
  // sustained decline (16 bearish bars) so Wilder RSI falls below 30
  for (let k = 0; k < 16; k++) {
    const c = 100.5 - 0.4 * k;
    const i = chart.length;
    chart.push({ openTime: T0 + i * STEP, open: c + 0.35, high: c + 0.4, low: c - 0.1, close: c, volume: 1000 });
  }
  // hammer reversal with a long lower wick piercing the lower band, low volume
  const i = chart.length;
  const base = 100.5 - 0.4 * 16;
  chart.push({ openTime: T0 + i * STEP, open: base - 0.1, high: base + 0.15, low: base - 2.0, close: base + 0.1, volume: 600 });
  const strat = new MeanReversionStrategy();
  const sigs = strat.scan(ctx(chart, htfUp(), MarketRegime.RANGING));
  assert.equal(sigs.length, 1, JSON.stringify(sigs));
  assert.equal(sigs[0]!.direction, "long");
});

test("vwap bounce fires a long on a pullback-and-reject to VWAP in an uptrend", () => {
  const chart: Candle[] = [];
  for (let i = 0; i < 59; i++) {
    const close = 100 + i * 0.05;
    chart.push({ openTime: T0 + i * STEP, open: close - 0.03, high: close + 0.05, low: close - 0.05, close, volume: 1000 });
  }
  // bar dips to VWAP with a long lower wick, closes back up, elevated volume
  chart.push({ openTime: T0 + 59 * STEP, open: 102.9, high: 103.2, low: 100.5, close: 103.1, volume: 1600 });
  const strat = new VwapBounceStrategy();
  const sigs = strat.scan(ctx(chart, htfUp(), MarketRegime.TRENDING_UP));
  assert.equal(sigs.length, 1, JSON.stringify(sigs));
  assert.equal(sigs[0]!.direction, "long");
});

test("strategies stay silent on a flat series", () => {
  const flat: Candle[] = [];
  for (let i = 0; i < 120; i++) flat.push({ openTime: T0 + i * STEP, open: 100, high: 100.2, low: 99.8, close: 100, volume: 1000 });
  const c = ctx(flat, htfDown(), MarketRegime.TRENDING_UP);
  assert.equal(new MomentumBreakoutStrategy().scan(c).length, 0);
  assert.equal(new MeanReversionStrategy().scan(c).length, 0);
  assert.equal(new VwapBounceStrategy().scan(c).length, 0);
});
