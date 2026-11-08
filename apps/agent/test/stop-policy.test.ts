import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type Signal } from "@cryptogate/shared";
import { applyStopFloor } from "../src/engine/stop-policy.js";
import { sanitizeMinStopAtr } from "../src/server/index.js";

test("sanitizeMinStopAtr clamps to 0..10 and falls back on missing/invalid input", () => {
  assert.equal(sanitizeMinStopAtr(undefined, 1.5), 1.5);
  assert.equal(sanitizeMinStopAtr("abc", 1.5), 1.5);
  assert.equal(sanitizeMinStopAtr(0, 1.5), 0); // 0 = off, must not fall back
  assert.equal(sanitizeMinStopAtr(-3, 1.5), 0);
  assert.equal(sanitizeMinStopAtr(99, 1.5), 10);
  assert.equal(sanitizeMinStopAtr("2.5", 1.5), 2.5);
});

function sig(partial: Partial<Signal>): Signal {
  return {
    id: "x", strategy: "vwap_bounce", symbol: "BTCUSDT", direction: "long",
    entryPrice: 100, entryType: "market", stopLoss: 99.8,
    takeProfit1: 100.3, takeProfit2: 100.5, riskReward: 2.5, confidence: 0.7,
    regime: MarketRegime.TRENDING_UP, reasoning: "t", timestamp: 0, expiry: 1,
    ...partial,
  };
}

test("tight long SL is widened to minStopAtr x ATR, TPs keep their R multiples", () => {
  // risk 0.2, ATR 0.4, floor 1.5 ATR = 0.6
  const out = applyStopFloor(sig({}), 0.4, { minStopAtr: 1.5 });
  assert.ok(Math.abs(out.stopLoss - 99.4) < 1e-9);
  assert.ok(Math.abs(out.takeProfit1 - 100.9) < 1e-9); // 1.5R of 0.6
  assert.ok(Math.abs(out.takeProfit2 - 101.5) < 1e-9); // 2.5R of 0.6
  assert.equal(out.riskReward, 2.5);
  assert.equal(out.meta?.originalStopLoss, 99.8);
});

test("tight short SL is widened on the correct side", () => {
  const s = sig({ direction: "short", stopLoss: 100.2, takeProfit1: 99.7, takeProfit2: 99.5 });
  const out = applyStopFloor(s, 0.4, { minStopAtr: 1.5 });
  assert.ok(Math.abs(out.stopLoss - 100.6) < 1e-9);
  assert.ok(Math.abs(out.takeProfit1 - 99.1) < 1e-9);
  assert.ok(Math.abs(out.takeProfit2 - 98.5) < 1e-9);
});

test("stops already wider than the floor are left untouched", () => {
  const s = sig({ stopLoss: 99, takeProfit1: 101.5, takeProfit2: 102.5 });
  assert.equal(applyStopFloor(s, 0.4, { minStopAtr: 1.5 }), s);
});

test("no-op on invalid ATR or disabled floor", () => {
  const s = sig({});
  assert.equal(applyStopFloor(s, NaN, { minStopAtr: 1.5 }), s);
  assert.equal(applyStopFloor(s, 0.4, { minStopAtr: 0 }), s);
});
