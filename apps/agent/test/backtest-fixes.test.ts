import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, TF_MS, type Candle, type RegimeResult, type Signal, type StrategyName } from "@cryptogate/shared";
import { aggregate } from "../src/engine/aggregator.js";
import { SmcSweepStrategy, PrecomputedSmcStrategy } from "../src/strategies/smc-strategy.js";
import { detectSmcSignals } from "../src/strategies/smc-sweep.js";
import type { Strategy } from "../src/strategies/base.js";
import {
  backtestMulti,
  simulateTrade,
  walkForwardSplit,
  MULTI_BT_DEFAULT,
  ORDERFLOW_STRATEGIES,
} from "../src/backtest/multi-runner.js";

const T0 = 1_700_000_000_000;
const STEP = 900_000;

function regime(r: MarketRegime, confidence = 0.8): RegimeResult {
  return { regime: r, confidence, trendDirection: 1, volatilityLevel: 1, adx: 32, timestamp: 0 };
}
function fixtureChart(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 63; i++) out.push({ openTime: T0 + i * STEP, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000 });
  out[58] = { openTime: T0 + 58 * STEP, open: 100, high: 100.5, low: 97.6, close: 100.2, volume: 1500 };
  out[59] = { openTime: T0 + 59 * STEP, open: 100.4, high: 100.6, low: 99.4, close: 99.6, volume: 1200 };
  out[60] = { openTime: T0 + 60 * STEP, open: 99.6, high: 102.6, low: 99.5, close: 102.5, volume: 3000 };
  out[61] = { openTime: T0 + 61 * STEP, open: 102.0, high: 102.4, low: 101.9, close: 102.2, volume: 1000 };
  out[62] = { openTime: T0 + 62 * STEP, open: 100.0, high: 101.0, low: 99.8, close: 100.8, volume: 1400 };
  return out;
}
function fixtureHtf(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 80; i++) out.push({ openTime: T0 + i * STEP, open: 100, high: 100.5, low: i === 10 ? 98 : 99.5, close: 100, volume: 1000 });
  return out;
}
const SMC_PERMISSIVE = {
  displacementMult: 1.8, sweepWickMin: 0.3, slBuffer: 0.3, tp1Rr: 1.5, tp2Rr: 4.0,
  cooldownBars: 3, zoneMaxAge: 50, swingLen: 5, sweepLookback: 20, obEnabled: true, fvgEnabled: true,
  chochRequired: false, sessionFilter: false,
};
const smc = () => new SmcSweepStrategy(SMC_PERMISSIVE);

test("PrecomputedSmcStrategy replays full-series SMC signals only on their own bar", () => {
  const chart = fixtureChart();
  const htf = fixtureHtf();
  const raw = detectSmcSignals(chart, htf, "15m", SMC_PERMISSIVE);
  assert.ok(raw.length >= 1, "fixture should produce at least one SMC signal");
  const pre = new PrecomputedSmcStrategy(chart, htf, "15m", SMC_PERMISSIVE);
  const ctxAt = (bar: number) => ({
    symbol: "BTCUSDT", chart: chart.slice(0, bar + 1), htf, htfTf: "15m" as const,
    regime: regime(MarketRegime.TRENDING_UP), signalTtlMs: 1000,
  });
  const bar = raw[0]!.barIndex;
  pre.cursor = bar;
  const out = pre.scan(ctxAt(bar));
  assert.equal(out.length, raw.filter((s) => s.barIndex === bar).length);
  assert.equal(out[0]!.strategy, "smc_sweep");
  assert.equal(out[0]!.direction, raw[0]!.direction);
  pre.cursor = bar - 1;
  assert.equal(pre.scan(ctxAt(bar - 1)).length, 0);
});
function agg(regimeSwitching: boolean) {
  return aggregate({
    symbol: "BTCUSDT",
    chart: fixtureChart(),
    htf: fixtureHtf(),
    htfTf: "15m",
    regime: regime(MarketRegime.RANGING), // SMC is NOT active in RANGING per the regime map
    signalTtlMs: 30 * 60 * 1000,
    registry: new Map<StrategyName, Strategy>([["smc_sweep", smc()]]),
    history: [],
    regimeSwitching,
  });
}

test("regime switching ON gates SMC out of RANGING; OFF lets every registered strategy run", () => {
  assert.equal(agg(true).length, 0);
  const ranked = agg(false);
  assert.ok(ranked.length >= 1, "expected SMC to fire once regime gating is off");
  assert.equal(ranked[0]!.signal.strategy, "smc_sweep");
});

test("backtest reports order-flow strategies as skipped instead of silently showing 0 trades", () => {
  const flat: Candle[] = [];
  for (let i = 0; i < 300; i++) flat.push({ openTime: T0 + i * STEP, open: 100, high: 100.1, low: 99.9, close: 100, volume: 1000 });
  const all = backtestMulti(flat, flat, { ...MULTI_BT_DEFAULT, strategies: "all" });
  assert.deepEqual([...all.skippedStrategies].sort(), [...ORDERFLOW_STRATEGIES].sort());
  const only = backtestMulti(flat, flat, { ...MULTI_BT_DEFAULT, strategies: ["smc_sweep", "oi_divergence"] });
  assert.deepEqual(only.skippedStrategies, ["oi_divergence"]);
  const none = backtestMulti(flat, flat, { ...MULTI_BT_DEFAULT, strategies: ["smc_sweep"] });
  assert.deepEqual(none.skippedStrategies, []);
});

test("R multiple uses the risk budgeted at entry (equity × risk%), not the starting equity", () => {
  const sig: Signal = {
    id: "x", strategy: "vwap_bounce", symbol: "BTCUSDT", direction: "long",
    entryPrice: 100, entryType: "market", stopLoss: 99, takeProfit1: 101.5, takeProfit2: 102.5,
    riskReward: 2.5, confidence: 0.7, regime: MarketRegime.TRENDING_UP, reasoning: "t", timestamp: T0, expiry: T0 + 1,
  };
  const chart: Candle[] = [
    { openTime: T0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
    { openTime: T0 + STEP, open: 100, high: 100, low: 98.5, close: 98.8, volume: 1 }, // hits SL
    { openTime: T0 + 2 * STEP, open: 98.8, high: 99, low: 98.7, close: 98.9, volume: 1 },
  ];
  // account has shrunk to 1000 (start was 10000): budgeted risk = 1000 × 2% = 20
  const t = simulateTrade(sig, chart, 0, 1000, { ...MULTI_BT_DEFAULT, startEquity: 10_000 }, 1)!;
  assert.equal(t.exitType, "SL");
  assert.ok(t.pnl < 0);
  // a full stop-out costs ~1R plus fees/slippage; the old formula would have shown ~-0.1R
  assert.ok(t.rMultiple < -0.95 && t.rMultiple > -2, `R was ${t.rMultiple}`);
});

function winnerChart(topHigh: number): Candle[] {
  return [
    { openTime: T0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
    { openTime: T0 + STEP, open: 100, high: topHigh, low: 99.9, close: 102, volume: 1 },
    { openTime: T0 + 2 * STEP, open: 102, high: 102, low: 101.9, close: 102, volume: 1 },
  ];
}
const winnerSig = (): Signal => ({
  id: "w", strategy: "vwap_bounce", symbol: "BTCUSDT", direction: "long",
  entryPrice: 100, entryType: "market", stopLoss: 99, takeProfit1: 101.5, takeProfit2: 102.5,
  riskReward: 2.5, confidence: 0.7, regime: MarketRegime.TRENDING_UP, reasoning: "t", timestamp: T0, expiry: T0 + 1,
});

test("maker TPs cost less than market TPs on the same winning trade", () => {
  const taker = simulateTrade(winnerSig(), winnerChart(103), 0, 10_000, { ...MULTI_BT_DEFAULT, tpMaker: false }, 1)!;
  const maker = simulateTrade(winnerSig(), winnerChart(103), 0, 10_000, { ...MULTI_BT_DEFAULT, tpMaker: true }, 1)!;
  assert.equal(taker.exitType, "TP2");
  assert.equal(maker.exitType, "TP2");
  assert.ok(maker.pnl > taker.pnl, `maker ${maker.pnl} should beat taker ${taker.pnl}`);
});

test("a limit TP does not fill when price only touches it, but a market TP does", () => {
  // bar 1's high reaches exactly TP1 (101.5): a touch, no trade-through; bar 2 never gets near it
  const touchOnly: Candle[] = [
    { openTime: T0, open: 100, high: 100, low: 100, close: 100, volume: 1 },
    { openTime: T0 + STEP, open: 100, high: 101.5, low: 99.9, close: 101, volume: 1 },
    { openTime: T0 + 2 * STEP, open: 101, high: 101.4, low: 100.6, close: 101, volume: 1 },
  ];
  const mk = simulateTrade(winnerSig(), touchOnly, 0, 10_000, { ...MULTI_BT_DEFAULT, tpMaker: true }, 1)!;
  const tk = simulateTrade(winnerSig(), touchOnly, 0, 10_000, { ...MULTI_BT_DEFAULT, tpMaker: false }, 1)!;
  assert.equal(tk.exitType, "TP1", "market TP triggers on touch");
  assert.equal(mk.exitType, "EOD", "limit TP must not fill on a mere touch");
});

test("walkForwardSplit warm-up overlap follows the HTF duration instead of hard-coded 4h", () => {
  const chart: Candle[] = [];
  // 10k × 15m bars = 2500h of data; split at 70% = hour 1750
  for (let i = 0; i < 10_000; i++) chart.push({ openTime: T0 + i * STEP, open: 1, high: 1, low: 1, close: 1, volume: 1 });
  const htf1h: Candle[] = [];
  for (let i = 0; i < 2500; i++) htf1h.push({ openTime: T0 + i * TF_MS["1h"], open: 1, high: 1, low: 1, close: 1, volume: 1 });
  const splitTime = chart[7000]!.openTime;

  const asHour = walkForwardSplit(chart, htf1h, 0.7, TF_MS["1h"]);
  const asDefault = walkForwardSplit(chart, htf1h, 0.7); // legacy 4h assumption
  const oldestHour = asHour.test.htf[0]!.openTime;
  const oldestDefault = asDefault.test.htf[0]!.openTime;
  assert.ok(oldestHour >= splitTime - 200 * TF_MS["1h"]);
  assert.ok(oldestDefault < oldestHour, "4h default reaches further back than a correct 1h window");
});
