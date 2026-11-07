import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type Candle, type RegimeResult } from "@cryptogate/shared";
import type { ScanContext } from "../src/strategies/base.js";
import type { OrderFlowSnapshot } from "../src/data/orderflow.js";
import { OiDivergenceStrategy } from "../src/strategies/oi-divergence.js";
import { LiquidationFadeStrategy } from "../src/strategies/liquidation-fade.js";

const STEP = 900_000;
const T0 = 1_700_006_400_000;

function regime(r: MarketRegime): RegimeResult {
  return { regime: r, confidence: 0.8, trendDirection: 0, volatilityLevel: 2, adx: 20, timestamp: 0 };
}
function ctx(chart: Candle[], of: OrderFlowSnapshot | undefined, r: MarketRegime): ScanContext {
  return { symbol: "BTCUSDT", chart, htf: [], htfTf: "4h", regime: regime(r), signalTtlMs: 1_800_000, orderflow: of };
}
function decliningOi(start: number, end: number, len: number, flatTail = false): OrderFlowSnapshot {
  const oi: number[] = [];
  for (let i = 0; i < len; i++) oi.push(start + ((end - start) * i) / (len - 1));
  if (flatTail) oi[oi.length - 1] = oi[oi.length - 2]!; // stabilising
  return { oi, oiTimestamps: oi.map((_, i) => T0 + i * STEP), fundingRate: -0.02, lsRatio: 0.35 };
}

test("OI divergence fires a long on a new low while OI declines (crowd short)", () => {
  const chart: Candle[] = [];
  for (let i = 0; i < 29; i++) chart.push({ openTime: T0 + i * STEP, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000 });
  // new local low with OI falling
  chart.push({ openTime: T0 + 29 * STEP, open: 98.8, high: 99.0, low: 98.0, close: 98.6, volume: 2000 });
  const of = decliningOi(1000, 900, 25); // ~10% decline over window
  const sigs = new OiDivergenceStrategy().scan(ctx(chart, of, MarketRegime.HIGH_VOLATILITY));
  assert.equal(sigs.length, 1, JSON.stringify(sigs));
  assert.equal(sigs[0]!.direction, "long");
  assert.ok(sigs[0]!.stopLoss < 98);
});

test("liquidation fade longs the first reversal after a dump cascade", () => {
  const chart: Candle[] = [];
  for (let i = 0; i < 21; i++) chart.push({ openTime: T0 + i * STEP, open: 100, high: 100.4, low: 99.6, close: 100, volume: 1000 });
  // cascade down: 8 red candles with bodies > ATR
  let p = 100;
  for (let k = 0; k < 8; k++) {
    const open = p;
    p -= 1.0;
    chart.push({ openTime: T0 + (21 + k) * STEP, open, high: open + 0.1, low: p - 0.1, close: p, volume: 3000 });
  }
  // reversal bullish candle (hammer) at the end
  chart.push({ openTime: T0 + 29 * STEP, open: p - 0.1, high: p + 0.9, low: p - 0.3, close: p + 0.8, volume: 4000 });
  const of = decliningOi(1000, 820, 20, true); // steep (>5% over window) drop, stabilising tail
  const sigs = new LiquidationFadeStrategy().scan(ctx(chart, of, MarketRegime.HIGH_VOLATILITY));
  assert.equal(sigs.length, 1, JSON.stringify(sigs));
  assert.equal(sigs[0]!.direction, "long");
  assert.equal(sigs[0]!.meta?.positionSizeMultiplier, 0.5);
});

test("both stay silent without order-flow data", () => {
  const chart: Candle[] = [];
  for (let i = 0; i < 30; i++) chart.push({ openTime: T0 + i * STEP, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000 });
  const c = ctx(chart, undefined, MarketRegime.HIGH_VOLATILITY);
  assert.equal(new OiDivergenceStrategy().scan(c).length, 0);
  assert.equal(new LiquidationFadeStrategy().scan(c).length, 0);
});
