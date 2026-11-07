import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type PositionSize, type Signal } from "@cryptogate/shared";
import { PaperExchangeClient } from "../src/execution/binance-client.js";
import { executeSignal } from "../src/execution/executor.js";
import { PositionManager } from "../src/execution/position-manager.js";
import { TradeTracker } from "../src/execution/trade-tracker.js";
import { RiskManager, RISK_DEFAULT } from "../src/risk/manager.js";
import { InMemoryJournal } from "../src/monitoring/journal.js";
import type { Notifier } from "../src/monitoring/telegram.js";
import type { OrderFillEvent } from "../src/execution/user-stream.js";

function sig(): Signal {
  return {
    id: "x", strategy: "smc_sweep", symbol: "BTCUSDT", direction: "long",
    entryPrice: 100, entryType: "market", stopLoss: 98, takeProfit1: 103, takeProfit2: 108,
    riskReward: 4, confidence: 0.7, regime: MarketRegime.TRENDING_UP, reasoning: "t", timestamp: 1000, expiry: 2000,
  };
}
const size: PositionSize = { notional: 1000, quantity: 10, margin: 50, riskAmount: 250, leverageUsed: 2 };

function fill(orderId: string, realizedPnl: number, avgPrice: number): OrderFillEvent {
  return { type: "fill", symbol: "BTCUSDT", orderId, side: "SELL", orderType: "TAKE_PROFIT_MARKET", status: "FILLED", lastFilledQty: 5, avgPrice, realizedPnl, timestamp: 2000 };
}

async function setup() {
  const client = new PaperExchangeClient();
  const pm = new PositionManager();
  const pos = await executeSignal(client, sig(), size, { leverage: 20 });
  pm.add(pos);
  const got: string[] = [];
  const notifier: Notifier = { async send(m) { got.push(m); } };
  const risk = new RiskManager(RISK_DEFAULT, 10_000, 1000);
  const journal = new InMemoryJournal();
  const tracker = new TradeTracker(10_000, pm, client, risk, journal, notifier);
  return { client, pm, pos, got, risk, journal, tracker };
}

test("TP1 fill realizes profit, moves SL to breakeven, notifies", async () => {
  const { pm, pos, got, tracker, journal } = await setup();
  await tracker.processFill(fill(pos.tp1OrderId, 75, 103));
  const updated = pm.get("BTCUSDT")!;
  assert.equal(tracker.equity, 10_075);
  assert.equal(updated.tp1Hit, true);
  assert.equal(updated.slPrice, 100); // breakeven
  assert.ok(got.some((m) => /TP1 HIT/.test(m)));
  assert.equal(journal.equity.length, 1);
});

test("TP1 then TP2 records a closed winning trade and clears the position", async () => {
  const { pm, pos, tracker, journal } = await setup();
  await tracker.processFill(fill(pos.tp1OrderId, 75, 103));
  await tracker.processFill(fill(pos.tp2OrderId, 150, 108));
  assert.equal(tracker.equity, 10_225);
  assert.equal(journal.trades.length, 1);
  const t = journal.trades[0]!;
  assert.equal(t.exitType, "TP2");
  assert.equal(t.pnlUsdt, 225);
  assert.equal(t.rMultiple, 0.9); // 225 / 250 riskAmount
  assert.equal(pm.get("BTCUSDT"), undefined);
});

test("SL with no TP1 records a full loss and trips the loss-streak counter", async () => {
  const { pm, pos, tracker, journal, risk } = await setup();
  await tracker.processFill(fill(pos.slOrderId, -250, 98));
  assert.equal(tracker.equity, 9_750);
  assert.equal(journal.trades[0]!.exitType, "SL");
  assert.equal(pm.get("BTCUSDT"), undefined);
  assert.equal(risk.breaker.snapshot().consecutiveLosses, 1);
});
