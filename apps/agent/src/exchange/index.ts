/**
 * Exchange factory — creates the right adapter based on EXCHANGE env var.
 * Also re-exports PaperExchangeClient for test/paper mode.
 */
import type { ExchangeName } from "@cryptogate/shared";
import type { ExchangeAdapter, ExchangeClient, OrderParams, OrderResult } from "./adapter.js";
import { createBinanceAdapter } from "./binance.js";
import { createBitgetAdapter } from "./bitget.js";

export type { ExchangeAdapter, ExchangeClient, MarketDataAdapter, OrderFlowAdapter, UserStreamAdapter, OrderParams, OrderResult, OrderSide, OrderType } from "./adapter.js";

export class PaperExchangeClient implements ExchangeClient {
  orders: OrderResult[] = [];
  canceled: string[] = [];
  leverage = new Map<string, number>();
  private seq = 0;

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    this.leverage.set(symbol, leverage);
  }
  async setMarginType(): Promise<void> {}
  async createOrder(params: OrderParams): Promise<OrderResult> {
    const order: OrderResult = {
      orderId: `paper-${++this.seq}`,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: params.type === "MARKET" ? "FILLED" : "NEW",
      quantity: params.quantity ?? 0,
    };
    this.orders.push(order);
    return order;
  }
  async cancelOrder(_symbol: string, orderId: string): Promise<void> {
    this.canceled.push(orderId);
    const o = this.orders.find((x) => x.orderId === orderId);
    if (o) o.status = "CANCELED";
  }
}

export function createExchangeAdapter(exchange: ExchangeName): ExchangeAdapter {
  if (exchange === "bitget") {
    const apiKey = process.env.BITGET_API_KEY;
    const apiSecret = process.env.BITGET_API_SECRET;
    const passphrase = process.env.BITGET_PASSPHRASE;
    if (!apiKey || !apiSecret || !passphrase) {
      throw new Error("BITGET_API_KEY, BITGET_API_SECRET, BITGET_PASSPHRASE required for Bitget");
    }
    console.log("[exchange] using Bitget Futures (USDT-M)");
    return createBitgetAdapter({ apiKey, apiSecret, passphrase, testnet: process.env.BITGET_TESTNET === "1" });
  }

  // Default: Binance
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("BINANCE_API_KEY, BINANCE_API_SECRET required for Binance");
  }
  console.log("[exchange] using Binance Futures (USDT-M, testnet=" + (process.env.BINANCE_TESTNET !== "false") + ")");
  return createBinanceAdapter({ apiKey, apiSecret, testnet: process.env.BINANCE_TESTNET !== "false" });
}
