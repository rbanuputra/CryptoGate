import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type PositionSize, type Signal } from "@cryptogate/shared";
import { PaperExchangeClient } from "../src/execution/binance-client.js";
import { executeSignal } from "../src/execution/executor.js";
import { PositionManager } from "../src/execution/position-manager.js";

function sig(): Signal {
  return {
    id: "x", strategy: "smc_sweep", symbol: "BTCUSDT", direction: "long",
    entryPrice: 100, entryType: "market", stopLoss: 98, takeProfit1: 103, takeProfit2: 108,
    riskReward: 4, confidence: 0.7, regime: MarketRegime.TRENDING_UP, reasoning: "t",
    timestamp: 0, expiry: 1,
  };
}
const size: PositionSize = { notional: 1000, quantity: 10, margin: 50, riskAmount: 250, leverageUsed: 2 };

test("executeSignal places entry + SL + TP1(50%) + TP2(rest) with correct sides", async () => {
  const client = new PaperExchangeClient();
  const pos = await executeSignal(client, sig(), size, { leverage: 20, stepSize: 0.001 });

  assert.equal(client.orders.length, 4);
  const [entry, sl, tp1, tp2] = client.orders;
  assert.equal(entry!.side, "BUY");
  assert.equal(entry!.type, "MARKET");
  assert.equal(entry!.status, "FILLED");
  assert.equal(sl!.side, "SELL");
  assert.equal(sl!.type, "STOP_MARKET");
  assert.equal(tp1!.quantity, 5); // 50%
  assert.equal(tp2!.quantity, 5);
  assert.equal(client.leverage.get("BTCUSDT"), 20);
  assert.equal(pos.remainingQty, 5);
  assert.equal(pos.tp1Hit, false);
});

test("onTP1Hit cancels the original SL and places a breakeven stop", async () => {
  const client = new PaperExchangeClient();
  const pos = await executeSignal(client, sig(), size, { leverage: 20, stepSize: 0.001 });
  const pm = new PositionManager();
  pm.add(pos);

  const originalSl = pos.slOrderId;
  await pm.onTP1Hit(client, "BTCUSDT");
  const updated = pm.get("BTCUSDT")!;

  assert.ok(client.canceled.includes(originalSl));
  assert.equal(updated.tp1Hit, true);
  assert.equal(updated.slPrice, 100); // breakeven = entry
  assert.notEqual(updated.slOrderId, originalSl);
});

test("closeAll market-closes open positions and marks them closed", async () => {
  const client = new PaperExchangeClient();
  const pos = await executeSignal(client, sig(), size, { leverage: 20, stepSize: 0.001 });
  const pm = new PositionManager();
  pm.add(pos);
  await pm.closeAll(client);
  assert.equal(pm.get("BTCUSDT")!.status, "closed");
  assert.ok(client.orders.some((o) => o.type === "MARKET" && o.side === "SELL"));
});
