/**
 * Binance Futures (USDⓈ-M) adapter — wraps existing Binance code into
 * the unified ExchangeAdapter interface.
 */
import { createHmac } from "node:crypto";
import WebSocket from "ws";
import { TF_MS, type Candle, type Timeframe } from "@cryptogate/shared";
import type {
  ExchangeAdapter,
  ExchangeClient,
  MarketDataAdapter,
  OrderFlowAdapter,
  UserStreamAdapter,
  OrderParams,
  OrderResult,
} from "./adapter.js";
import { parseUserDataMessage, type UserDataEvent } from "../execution/user-stream.js";

interface BinanceOptions {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

// ── Trading Client ──────────────────────────────────────────────────

class BinanceClient implements ExchangeClient {
  private readonly base: string;
  constructor(private readonly opts: BinanceOptions) {
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
    const query = new URLSearchParams({
      ...params, timestamp: String(Date.now()), recvWindow: "5000",
    } as Record<string, string>).toString();
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
      orderId: String(r.orderId), symbol: p.symbol, side: p.side, type: p.type,
      status: (r.status as OrderResult["status"]) ?? "NEW", quantity: p.quantity ?? 0,
    };
  }
  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    await this.signedRequest("/fapi/v1/order", { symbol, orderId }, "DELETE");
  }
}

// ── Market Data ─────────────────────────────────────────────────────

class BinanceMarketData implements MarketDataAdapter {
  private readonly rest: string;
  private readonly wsBase: string;

  constructor(testnet?: boolean) {
    this.rest = testnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
    this.wsBase = testnet ? "wss://stream.binancefuture.com/stream?streams=" : "wss://fstream.binance.com/stream?streams=";
  }

  async fetchKlines(
    symbol: string, interval: Timeframe,
    opts: { startMs?: number; endMs?: number; limit?: number } = {},
  ): Promise<Candle[]> {
    const step = TF_MS[interval];
    const end = opts.endMs ?? Date.now();
    let cursor = opts.startMs ?? end - step * (opts.limit ?? 1500);
    const out: Candle[] = [];
    while (cursor < end) {
      const url = `${this.rest}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${end}&limit=1500`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`binance klines ${symbol} ${interval} HTTP ${res.status}`);
      const rows = (await res.json()) as unknown[][];
      if (rows.length === 0) break;
      for (const k of rows) {
        out.push({
          openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]),
          low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]), closeTime: Number(k[6]),
        });
      }
      const lastOpen = Number(rows[rows.length - 1]![0]);
      const next = lastOpen + step;
      if (next <= cursor) break;
      cursor = next;
      if (rows.length < 1500) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }

  klineWsUrl(symbols: string[], timeframes: Timeframe[]): string {
    const streams = symbols
      .flatMap((s) => timeframes.map((tf) => `${s.toLowerCase()}@kline_${tf}`))
      .join("/");
    return this.wsBase + streams;
  }

  parseKlineWsMessage(raw: string): { symbol: string; tf: Timeframe; candle: Candle; isClosed: boolean } | null {
    let msg: { data?: { s: string; k: { t: number; T: number; i: string; o: string; h: string; l: string; c: string; v: string; x: boolean } } };
    try { msg = JSON.parse(raw); } catch { return null; }
    const k = msg.data?.k;
    const symbol = msg.data?.s;
    if (!k || !symbol) return null;
    return {
      symbol,
      tf: k.i as Timeframe,
      candle: {
        openTime: k.t, open: Number(k.o), high: Number(k.h),
        low: Number(k.l), close: Number(k.c), volume: Number(k.v), closeTime: k.T,
      },
      isClosed: k.x,
    };
  }
}

// ── Order Flow ──────────────────────────────────────────────────────

class BinanceOrderFlow implements OrderFlowAdapter {
  private readonly base: string;
  constructor(testnet?: boolean) {
    this.base = testnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
  }

  async fetchOpenInterest(symbol: string): Promise<number> {
    const res = await fetch(`${this.base}/fapi/v1/openInterest?symbol=${symbol}`);
    if (!res.ok) throw new Error(`openInterest ${symbol} HTTP ${res.status}`);
    const j = (await res.json()) as { openInterest: string };
    return Number(j.openInterest);
  }

  async fetchFundingRate(symbol: string): Promise<number> {
    const res = await fetch(`${this.base}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
    if (!res.ok) throw new Error(`fundingRate ${symbol} HTTP ${res.status}`);
    const arr = (await res.json()) as Array<{ fundingRate: string }>;
    return Number(arr[0]?.fundingRate ?? 0) * 100;
  }

  async fetchLongShortRatio(symbol: string): Promise<number> {
    const res = await fetch(`${this.base}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=15m&limit=1`);
    if (!res.ok) throw new Error(`longShortRatio ${symbol} HTTP ${res.status}`);
    const arr = (await res.json()) as Array<{ longShortRatio: string }>;
    return Number(arr[0]?.longShortRatio ?? 1);
  }
}

// ── User Stream ─────────────────────────────────────────────────────

class BinanceUserStream implements UserStreamAdapter {
  private readonly rest: string;
  private readonly wsBase: string;
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private handlers: Array<(e: UserDataEvent) => void> = [];

  constructor(testnet?: boolean) {
    this.rest = testnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
    this.wsBase = testnet ? "wss://stream.binancefuture.com/ws/" : "wss://fstream.binance.com/ws/";
  }

  onEvent(fn: (e: UserDataEvent) => void): void {
    this.handlers.push(fn);
  }

  async connect(apiKey: string): Promise<void> {
    const res = await fetch(`${this.rest}/fapi/v1/listenKey`, {
      method: "POST", headers: { "X-MBX-APIKEY": apiKey },
    });
    if (!res.ok) throw new Error(`listenKey HTTP ${res.status}`);
    this.listenKey = ((await res.json()) as { listenKey: string }).listenKey;
    this.ws = new WebSocket(this.wsBase + this.listenKey);
    this.ws.on("message", (raw: WebSocket.RawData) => {
      const ev = parseUserDataMessage(raw.toString());
      if (ev) for (const h of this.handlers) h(ev);
    });
    this.ws.on("close", () => setTimeout(() => void this.connect(apiKey), 2000));
    this.keepAlive = setInterval(() => {
      if (!this.listenKey) return;
      void fetch(`${this.rest}/fapi/v1/listenKey`, { method: "PUT", headers: { "X-MBX-APIKEY": apiKey } }).catch(() => {});
    }, 30 * 60 * 1000);
  }

  close(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.ws?.close();
  }
}

// ── Factory ─────────────────────────────────────────────────────────

export function createBinanceAdapter(opts: BinanceOptions): ExchangeAdapter {
  return {
    name: "binance",
    client: new BinanceClient(opts),
    marketData: new BinanceMarketData(opts.testnet),
    orderFlow: new BinanceOrderFlow(opts.testnet),
    userStream: new BinanceUserStream(opts.testnet),
  };
}
