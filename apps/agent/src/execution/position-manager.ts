import type { Direction, PositionSize, Signal } from "@cryptogate/shared";
import type { ExchangeClient, OrderSide } from "../exchange/adapter.js";

export interface ManagedPosition {
  symbol: string;
  signal: Signal;
  direction: Direction;
  size: PositionSize;
  entryOrderId: string;
  slOrderId: string;
  tp1OrderId: string;
  tp2OrderId: string;
  remainingQty: number;
  tp1Hit: boolean;
  slPrice: number;
  status: "open" | "closed";
  /** realized PnL accumulated from partial fills so far */
  realizedPnl: number;
  openedAt: number;
}

export function exitSide(direction: Direction): OrderSide {
  return direction === "long" ? "SELL" : "BUY";
}

/** Tracks open positions and runs post-fill management (TP1 -> SL to breakeven). */
export class PositionManager {
  private positions = new Map<string, ManagedPosition>();

  add(pos: ManagedPosition): void {
    this.positions.set(pos.symbol, pos);
  }
  get(symbol: string): ManagedPosition | undefined {
    return this.positions.get(symbol);
  }
  list(): ManagedPosition[] {
    return [...this.positions.values()];
  }
  openLike(): { symbol: string; direction: Direction }[] {
    return this.list().filter((p) => p.status === "open").map((p) => ({ symbol: p.symbol, direction: p.direction }));
  }
  remove(symbol: string): void {
    this.positions.delete(symbol);
  }

  /** TP1 filled: cancel the original SL and move it to breakeven for the rest. */
  async onTP1Hit(client: ExchangeClient, symbol: string): Promise<void> {
    const pos = this.positions.get(symbol);
    if (!pos || pos.tp1Hit) return;
    await client.cancelOrder(symbol, pos.slOrderId);
    const be = await client.createOrder({
      symbol,
      side: exitSide(pos.direction),
      type: "STOP_MARKET",
      stopPrice: pos.signal.entryPrice,
      quantity: pos.remainingQty,
      workingType: "MARK_PRICE",
      reduceOnly: true,
    });
    pos.slOrderId = be.orderId;
    pos.slPrice = pos.signal.entryPrice;
    pos.tp1Hit = true;
  }

  /** Emergency: market-close every open position and cancel resting orders. */
  async closeAll(client: ExchangeClient): Promise<void> {
    for (const pos of this.list()) {
      if (pos.status !== "open") continue;
      await client.cancelOrder(pos.symbol, pos.slOrderId).catch(() => {});
      await client.cancelOrder(pos.symbol, pos.tp1OrderId).catch(() => {});
      await client.cancelOrder(pos.symbol, pos.tp2OrderId).catch(() => {});
      await client.createOrder({
        symbol: pos.symbol,
        side: exitSide(pos.direction),
        type: "MARKET",
        quantity: pos.remainingQty,
        reduceOnly: true,
      });
      pos.status = "closed";
    }
  }
}
