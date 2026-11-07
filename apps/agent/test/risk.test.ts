import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type Signal } from "@cryptogate/shared";
import {
  calculatePositionSize,
  drawdownSizeMultiplier,
  confidenceSizeMultiplier,
  RiskManager,
  RISK_DEFAULT,
} from "../src/risk/manager.js";
import { areCorrelated, countCorrelatedPositions } from "../src/risk/correlation.js";

function sig(p: Partial<Signal> = {}): Signal {
  return {
    id: "x", strategy: "smc_sweep", symbol: "BTCUSDT", direction: "long",
    entryPrice: 100, entryType: "market", stopLoss: 98, takeProfit1: 103, takeProfit2: 108,
    riskReward: 4, confidence: 0.7, regime: MarketRegime.TRENDING_UP, reasoning: "t",
    timestamp: 1_700_000_000_000, expiry: 1_700_000_900_000, ...p,
  };
}

test("position size: risk/SL distance with leverage cap", () => {
  const a = calculatePositionSize(100, 98, 10_000, RISK_DEFAULT, 1.0, 0.001);
  // risk 2500 / 0.02 = 125000 notional (< 200k cap)
  assert.equal(a.notional, 125_000);
  assert.equal(a.quantity, 1250);
  assert.equal(a.leverageUsed, 12.5);

  const capped = calculatePositionSize(100, 99, 10_000, RISK_DEFAULT, 1.0, 0.001);
  // risk 2500 / 0.01 = 250000 -> capped at 200000
  assert.equal(capped.notional, 200_000);
  assert.equal(capped.leverageUsed, 20);
});

test("drawdown + confidence size multipliers follow the ladder", () => {
  assert.equal(drawdownSizeMultiplier(0.05, RISK_DEFAULT), 1.0);
  assert.equal(drawdownSizeMultiplier(0.12, RISK_DEFAULT), 0.75);
  assert.equal(drawdownSizeMultiplier(0.22, RISK_DEFAULT), 0.5);
  assert.equal(drawdownSizeMultiplier(0.35, RISK_DEFAULT), 0);
  assert.equal(confidenceSizeMultiplier(sig({ confidence: 0.85 }), true), 1.0);
  assert.equal(confidenceSizeMultiplier(sig({ confidence: 0.7 }), false), 0.75);
  assert.equal(confidenceSizeMultiplier(sig({ confidence: 0.5 }), false), 0.5);
});

test("correlation helpers group BTC/ETH and count same-direction exposure", () => {
  assert.ok(areCorrelated("BTCUSDT", "ETHUSDT"));
  assert.ok(!areCorrelated("BTCUSDT", "DOGEUSDT"));
  const n = countCorrelatedPositions("BTCUSDT", "long", [
    { symbol: "ETHUSDT", direction: "long" },
    { symbol: "ETHUSDT", direction: "short" },
  ]);
  assert.equal(n, 1);
});

test("RiskManager approves a clean signal and sizes it", () => {
  const rm = new RiskManager(RISK_DEFAULT, 10_000, 1_700_000_000_000);
  const d = rm.evaluate(sig(), {
    equity: 10_000, peakEquity: 10_000, openPositions: [], multiConfirm: false, now: 1_700_000_000_000,
  });
  assert.equal(d.approved, true);
  assert.ok(d.positionSize!.quantity > 0);
  assert.equal(d.sizeMultiplier, 0.75); // conf 0.7 -> 0.75, no drawdown
});

test("RiskManager rejects: low R:R, max positions, same symbol, correlation, dd halt", () => {
  const rm = new RiskManager(RISK_DEFAULT, 10_000, 1_700_000_000_000);
  const base = { equity: 10_000, peakEquity: 10_000, openPositions: [] as any[], multiConfirm: false, now: 1_700_000_000_000 };

  assert.equal(rm.evaluate(sig({ riskReward: 1.5 }), base).approved, false);
  assert.equal(rm.evaluate(sig(), { ...base, openPositions: [
    { symbol: "A", direction: "long" }, { symbol: "B", direction: "long" }, { symbol: "C", direction: "long" },
  ] }).approved, false);
  assert.equal(rm.evaluate(sig(), { ...base, openPositions: [{ symbol: "BTCUSDT", direction: "long" }] }).approved, false);
  // ETH correlates with BOTH BTC and SOL -> 2 correlated longs -> reject
  assert.equal(rm.evaluate(sig({ symbol: "ETHUSDT" }), { ...base, openPositions: [
    { symbol: "BTCUSDT", direction: "long" }, { symbol: "SOLUSDT", direction: "long" },
  ] }).approved, false);
  assert.equal(rm.evaluate(sig(), { ...base, equity: 6000, peakEquity: 10_000 }).approved, false); // 40% dd
});

test("circuit breaker trips after max consecutive losses", () => {
  const rm = new RiskManager(RISK_DEFAULT, 10_000, 1_700_000_000_000);
  for (let i = 0; i < 4; i++) rm.onClose(-10);
  const d = rm.evaluate(sig(), { equity: 9_960, peakEquity: 10_000, openPositions: [], multiConfirm: false, now: 1_700_000_000_000 });
  assert.equal(d.approved, false);
  assert.match(d.reason ?? "", /consecutive losses/);
});
