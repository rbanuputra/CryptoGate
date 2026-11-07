import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type RegimeResult, type Signal, type Candle } from "@cryptogate/shared";
import {
  getActiveStrategies,
  directionAllowed,
  scoreSignal,
  isStrategyActive,
  type ScoreContext,
} from "../src/engine/selector.js";
import { aggregate, multiStrategyConfirm } from "../src/engine/aggregator.js";
import { SmcSweepStrategy } from "../src/strategies/smc-strategy.js";
import type { Strategy } from "../src/strategies/base.js";
import type { StrategyName } from "@cryptogate/shared";

function regime(r: MarketRegime, confidence = 0.8): RegimeResult {
  return { regime: r, confidence, trendDirection: 1, volatilityLevel: 1, adx: 32, timestamp: 0 };
}
function sig(partial: Partial<Signal>): Signal {
  return {
    id: "x",
    strategy: "smc_sweep",
    symbol: "BTCUSDT",
    direction: "long",
    entryPrice: 100,
    entryType: "market",
    stopLoss: 98,
    takeProfit1: 103,
    takeProfit2: 108,
    riskReward: 4,
    confidence: 0.7,
    regime: MarketRegime.TRENDING_UP,
    reasoning: "test",
    timestamp: 0,
    expiry: 1,
    ...partial,
  };
}
const NOCTX: ScoreContext = {
  multiStrategyConfirm: false,
  isKeyLevel: false,
  hasCorrelatedPosition: false,
  dailyLossApproaching: false,
};

test("regime->strategy map activates SMC in trends, mean-reversion in range", () => {
  assert.ok(isStrategyActive(MarketRegime.TRENDING_UP, "smc_sweep"));
  assert.ok(!isStrategyActive(MarketRegime.RANGING, "smc_sweep"));
  assert.ok(isStrategyActive(MarketRegime.RANGING, "mean_reversion"));
  assert.ok(isStrategyActive(MarketRegime.HIGH_VOLATILITY, "liquidation_fade"));
});

test("directionAllowed respects strict policies", () => {
  assert.equal(directionAllowed("long_only", "long"), true);
  assert.equal(directionAllowed("long_only", "short"), false);
  assert.equal(directionAllowed("both", "short"), true);
});

test("scoreSignal applies weight, R:R bonus, and direction penalty", () => {
  const base = scoreSignal(sig({}), regime(MarketRegime.TRENDING_UP), NOCTX);
  // 0.7 conf * 1.0 weight * 0.8 regimeConf * 1.2 (rr>3) = 0.672
  assert.ok(Math.abs(base - 0.672) < 1e-6, `score=${base}`);

  // short in a long_only slot -> *0.3 penalty
  const against = scoreSignal(sig({ direction: "short" }), regime(MarketRegime.TRENDING_UP), NOCTX);
  assert.ok(against < base);

  // inactive strategy in this regime -> 0
  const inactive = scoreSignal(sig({ strategy: "mean_reversion" }), regime(MarketRegime.TRENDING_UP), NOCTX);
  assert.equal(inactive, 0);

  // multi-confirm bonus raises score
  const confirmed = scoreSignal(sig({}), regime(MarketRegime.TRENDING_UP), { ...NOCTX, multiStrategyConfirm: true });
  assert.ok(confirmed > base);
});

test("multiStrategyConfirm detects another strategy same symbol+dir within window", () => {
  const s = sig({ strategy: "smc_sweep", timestamp: 1_000_000 });
  const hist = [
    { symbol: "BTCUSDT", direction: "long" as const, strategy: "vwap_bounce" as StrategyName, timestamp: 1_000_000 - 60_000 },
  ];
  assert.equal(multiStrategyConfirm(s, hist, 1_000_000), true);
  assert.equal(multiStrategyConfirm(s, [], 1_000_000), false);
});

// --- aggregator end-to-end with the SMC fixture (signal on the last bar) ---
const T0 = 1_700_000_000_000;
const STEP = 900_000;
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

test("aggregate runs active strategies, scores and ranks the SMC signal", () => {
  const permissive = { chochRequired: false, sessionFilter: false } as const;
  const smc = new SmcSweepStrategy({
    displacementMult: 1.8, sweepWickMin: 0.3, slBuffer: 0.3, tp1Rr: 1.5, tp2Rr: 4.0,
    cooldownBars: 3, zoneMaxAge: 50, swingLen: 5, sweepLookback: 20, obEnabled: true, fvgEnabled: true,
    ...permissive,
  });
  const registry = new Map<StrategyName, Strategy>([["smc_sweep", smc]]);
  const ranked = aggregate({
    symbol: "BTCUSDT",
    chart: fixtureChart(),
    htf: fixtureHtf(),
    htfTf: "15m",
    regime: regime(MarketRegime.TRENDING_UP),
    signalTtlMs: 30 * 60 * 1000,
    registry,
    history: [],
  });
  assert.ok(ranked.length >= 1, "expected a ranked signal");
  assert.equal(ranked[0]!.signal.direction, "long");
  assert.ok(ranked[0]!.score > 0.3);
});

test("aggregate returns nothing when the only active strategy is unregistered", () => {
  const ranked = aggregate({
    symbol: "BTCUSDT",
    chart: fixtureChart(),
    htf: fixtureHtf(),
    htfTf: "15m",
    regime: regime(MarketRegime.RANGING), // activates mean_reversion (not registered)
    signalTtlMs: 1000,
    registry: new Map(),
    history: [],
  });
  assert.equal(ranked.length, 0);
});
