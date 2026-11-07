import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketRegime, type Signal } from "@cryptogate/shared";
import { InMemoryJournal } from "../src/monitoring/journal.js";
import { templates, MultiNotifier, type Notifier } from "../src/monitoring/telegram.js";
import { parseUserDataMessage } from "../src/execution/user-stream.js";

function sig(): Signal {
  return {
    id: "x", strategy: "smc_sweep", symbol: "BTCUSDT", direction: "long",
    entryPrice: 100, entryType: "market", stopLoss: 98, takeProfit1: 103, takeProfit2: 108,
    riskReward: 4, confidence: 0.7, regime: MarketRegime.TRENDING_UP, reasoning: "sweep", timestamp: 1, expiry: 2,
  };
}

test("InMemoryJournal records signals, trades and equity", async () => {
  const j = new InMemoryJournal();
  await j.recordSignal(sig(), "taken", 0.8);
  await j.recordEquity({ timestamp: 1, equity: 10100, openPnl: 0, drawdownPct: 0, positionCount: 1 });
  assert.equal(j.signals.length, 1);
  assert.equal(j.signals[0]!.status, "taken");
  assert.equal(j.equity[0]!.equity, 10100);
});

test("templates render the key fields", () => {
  assert.match(templates.entry(sig(), 2, 200), /LONG BTCUSDT/);
  assert.match(templates.tp1("BTCUSDT", 1.5), /TP1 HIT BTCUSDT/);
  assert.match(templates.sl("BTCUSDT", -1.2, 9800, true), /SL\(BE\)/);
});

test("MultiNotifier delivers to all targets even if one throws", async () => {
  const got: string[] = [];
  const good: Notifier = { async send(m) { got.push(m); } };
  const bad: Notifier = { async send() { throw new Error("down"); } };
  await new MultiNotifier([bad, good]).send("hello");
  assert.deepEqual(got, ["hello"]);
});

test("parseUserDataMessage decodes order fills and ignores noise", () => {
  const fill = parseUserDataMessage(JSON.stringify({
    e: "ORDER_TRADE_UPDATE", E: 1700,
    o: { s: "BTCUSDT", i: 42, S: "SELL", o: "TAKE_PROFIT_MARKET", X: "FILLED", l: "0.5", ap: "103", rp: "15.0" },
  }));
  assert.equal(fill?.type, "fill");
  assert.equal(fill?.type === "fill" && fill.orderId, "42");
  assert.equal(fill?.type === "fill" && fill.realizedPnl, 15);

  const acct = parseUserDataMessage(JSON.stringify({ e: "ACCOUNT_UPDATE", E: 1, a: { B: [{ a: "USDT", wb: "10050" }] } }));
  assert.equal(acct?.type, "account");
  assert.equal(parseUserDataMessage("not json"), null);
  assert.equal(parseUserDataMessage(JSON.stringify({ e: "OTHER" })), null);
});
