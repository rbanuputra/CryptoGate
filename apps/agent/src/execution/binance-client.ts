/**
 * Module 8: Exchange client abstraction.
 * `ExchangeClient` is what the executor talks to. `PaperExchangeClient` is an
 * in-memory simulator (tests / paper mode). `BinanceFuturesClient` signs REST
 * orders against Binance USDⓈ-M (live/testnet) — needs API keys + network.
 */
import { createHmac } from "node:crypto";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";

export interface OrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity?: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  closePosition?: boolean;
  timeInForce?: "GTC" | "IOC" | "FOK";
  workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: "NEW" | "FILLED" | "CANCELED";
  quantity: number;
}

export interface ExchangeClient {
  setLeverage(symbol: string, leverage: number): Promise<void>;
  setMarginType(symbol: string, type: "CROSS" | "ISOLATED"): Promise<void>;
  createOrder(params: OrderParams): Promise<OrderResult>;
  cancelOrder(symbol: string, orderId: string): Promise<void>;
}

/** Deterministic in-memory client for tests and paper trading. */
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

export interface BinanceClientOptions {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export class BinanceFuturesClient implements ExchangeClient {
  private readonly base: string;
  constructor(private readonly opts: BinanceClientOptions) {
    this.base = opts.testnet
      ? "https://testnet.binancefuture.com"
      : "https://fapi.binance.com";
  }

  private sign(query: string): string {
    return createHmac("sha256", this.opts.apiSecret).update(query).digest("hex");
  }

  private async signedRequest(
    path: string,
    params: Record<string, string | number>,
    method: "POST" | "DELETE" = "POST",
  ): Promise<unknown> {
    const query = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: "5000" } as Record<string, string>).toString();
    const sig = this.sign(query);
    const url = `${this.base}${path}?${query}&signature=${sig}`;
    const res = await fetch(url, { method, headers: { "X-MBX-APIKEY": this.opts.apiKey } });
    if (!res.ok) throw new Error(`binance ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedRequest("/fapi/v1/leverage", { symbol, leverage });
  }
  async setMarginType(symbol: string, type: "CROSS" | "ISOLATED"): Promise<void> {
    try {
      await this.signedRequest("/fapi/v1/marginType", { symbol, marginType: type });
    } catch (e) {
      // -4046 "No need to change margin type" is benign
      if (!(e instanceof Error) || !e.message.includes("4046")) throw e;
    }
  }
  async createOrder(p: OrderParams): Promise<OrderResult> {
    const params: Record<string, string | number> = { symbol: p.symbol, side: p.side, type: p.type };
    if (p.quantity !== undefined) params.quantity = p.quantity;
    if (p.price !== undefined) params.price = p.price;
    if (p.stopPrice !== undefined) params.stopPrice = p.stopPrice;
    if (p.reduceOnly !== undefined) params.reduceOnly = String(p.reduceOnly);
    if (p.closePosition !== undefined) params.closePosition = String(p.closePosition);
    if (p.timeInForce) params.timeInForce = p.timeInForce;
    if (p.workingType) params.workingType = p.workingType;
    const r = (await this.signedRequest("/fapi/v1/order", params)) as { orderId: number; status: string };
    return {
      orderId: String(r.orderId),
      symbol: p.symbol,
      side: p.side,
      type: p.type,
      status: (r.status as OrderResult["status"]) ?? "NEW",
      quantity: p.quantity ?? 0,
    };
  }
  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    await this.signedRequest("/fapi/v1/order", { symbol, orderId }, "DELETE");
  }
}
