/**
 * Module 8: Execution Engine — place a full bracket (entry + SL + TP1 50% + TP2)
 * for an approved signal. Works against any ExchangeClient (paper or live).
 */
import { roundToStep, type PositionSize, type Signal } from "@cryptogate/shared";
import type { ExchangeClient } from "../exchange/adapter.js";
import { exitSide, type ManagedPosition } from "./position-manager.js";

export interface ExecuteOptions {
  leverage: number;
  marginType?: "CROSS" | "ISOLATED";
  stepSize?: number;
}

export async function executeSignal(
  client: ExchangeClient,
  signal: Signal,
  size: PositionSize,
  opts: ExecuteOptions,
): Promise<ManagedPosition> {
  const { symbol } = signal;
  const entrySide = signal.direction === "long" ? "BUY" : "SELL";
  const closeSide = exitSide(signal.direction);
  const step = opts.stepSize ?? 0.001;

  await client.setLeverage(symbol, opts.leverage);
  await client.setMarginType(symbol, opts.marginType ?? "CROSS");

  // 1. entry (market)
  const entry = await client.createOrder({
    symbol,
    side: entrySide,
    type: signal.entryType === "market" ? "MARKET" : "LIMIT",
    quantity: size.quantity,
    price: signal.entryType === "limit" ? signal.entryPrice : undefined,
    timeInForce: signal.entryType === "limit" ? "GTC" : undefined,
  });

  // 2. stop loss (full quantity)
  const sl = await client.createOrder({
    symbol,
    side: closeSide,
    type: "STOP_MARKET",
    stopPrice: signal.stopLoss,
    quantity: size.quantity,
    workingType: "MARK_PRICE",
    reduceOnly: true,
  });

  // 3. TP1 (50%) and 4. TP2 (remainder)
  const tp1Qty = roundToStep(size.quantity * 0.5, step);
  const tp2Qty = roundToStep(size.quantity - tp1Qty, step);
  const tp1 = await client.createOrder({
    symbol, side: closeSide, type: "TAKE_PROFIT_MARKET",
    stopPrice: signal.takeProfit1, quantity: tp1Qty, workingType: "MARK_PRICE", reduceOnly: true,
  });
  const tp2 = await client.createOrder({
    symbol, side: closeSide, type: "TAKE_PROFIT_MARKET",
    stopPrice: signal.takeProfit2, quantity: tp2Qty, workingType: "MARK_PRICE", reduceOnly: true,
  });

  return {
    symbol,
    signal,
    direction: signal.direction,
    size,
    entryOrderId: entry.orderId,
    slOrderId: sl.orderId,
    tp1OrderId: tp1.orderId,
    tp2OrderId: tp2.orderId,
    remainingQty: tp2Qty,
    tp1Hit: false,
    slPrice: signal.stopLoss,
    status: "open",
    realizedPnl: 0,
    openedAt: signal.timestamp,
  };
}
