/**
 * Bitget Futures (USDT-M) adapter — implements ExchangeAdapter for Bitget's
 * Mix V2 API. Covers trading, market data (REST + WS), order flow, user stream.
 *
 * Bitget API docs: https://www.bitget.com/api-doc/contract/intro
 * Key differences from Binance:
 *   - HMAC signature includes timestamp + method + path + body
 *   - Kline intervals: "15m", "1H", "4H", "1D" (case-sensitive)
 *   - WS uses JSON subscribe messages, not URL-encoded streams
 *   - Symbol format: "BTCUSDT" (same as Binance for USDT-M)
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
import type { UserDataEvent } from "../execution/user-stream.js";

interface BitgetOptions {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  testnet?: boolean;
}

const TF_MAP: Record<string, string> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "12h": "12H",
  "1d": "1D", "3d": "3D", "1w": "1W",
};

const SIDE_MAP: Record<string, string> = { BUY: "buy", SELL: "sell" };

function bitgetTf(tf: Timeframe): string {
  return TF_MAP[tf] ?? tf;
}

// ── Signing ─────────────────────────────────────────────────────────

function sign(timestamp: string, method: string, path: string, body: string, secret: string): string {
  const pre = timestamp + method.toUpperCase() + path + body;
  return createHmac("sha256", secret).update(pre).digest("base64");
}

// ── Trading Client ──────────────────────────────────────────────────

class BitgetClient implements ExchangeClient {
  private readonly base: string;
  constructor(private readonly opts: BitgetOptions) {
    this.base = opts.testnet
      ? "https://api.bitget.com"
      : "https://api.bitget.com";
  }

  private async signedRequest(
    method: "GET" | "POST",
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const ts = String(Date.now());
    const body = method === "POST" ? JSON.stringify(params) : "";
    const queryStr = method === "GET" && Object.keys(params).length
      ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    const signPath = path + queryStr;
    const sig = sign(ts, method, signPath, body, this.opts.apiSecret);

    const url = this.base + path + queryStr;
    const headers: Record<string, string> = {
      "ACCESS-KEY": this.opts.apiKey,
      "ACCESS-SIGN": sig,
      "ACCESS-TIMESTAMP": ts,
      "ACCESS-PASSPHRASE": this.opts.passphrase,
      "Content-Type": "application/json",
      locale: "en-US",
    };
    const res = await fetch(url, { method, headers, body: method === "POST" ? body : undefined });
    if (!res.ok) throw new Error(`bitget ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const json = (await res.json()) as { code: string; msg: string; data: unknown };
    if (json.code !== "00000") throw new Error(`bitget ${path}: ${json.msg} (${json.code})`);
    return json.data;
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedRequest("POST", "/api/v2/mix/account/set-leverage", {
      symbol, productType: "USDT-FUTURES", marginCoin: "USDT",
      leverage: String(leverage), holdSide: "long",
    });
    await this.signedRequest("POST", "/api/v2/mix/account/set-leverage", {
      symbol, productType: "USDT-FUTURES", marginCoin: "USDT",
      leverage: String(leverage), holdSide: "short",
    }).catch(() => {});
  }

  async setMarginType(symbol: string, type: "CROSS" | "ISOLATED"): Promise<void> {
    await this.signedRequest("POST", "/api/v2/mix/account/set-margin-mode", {
      symbol, productType: "USDT-FUTURES", marginCoin: "USDT",
      marginMode: type === "CROSS" ? "crossed" : "isolated",
    }).catch((e: Error) => {
      if (!e.message.includes("same")) throw e;
    });
  }

  async createOrder(p: OrderParams): Promise<OrderResult> {
    const side = p.type === "MARKET" || p.type === "LIMIT"
      ? (SIDE_MAP[p.side] ?? "buy")
      : (SIDE_MAP[p.side] ?? "buy");

    const tradeSide = p.reduceOnly
      ? (p.side === "BUY" ? "close" : "close")
      : (p.side === "BUY" ? "open" : "open");

    let orderType = "market";
    const params: Record<string, unknown> = {
      symbol: p.symbol,
      productType: "USDT-FUTURES",
      marginMode: "crossed",
      marginCoin: "USDT",
      side,
      tradeSide,
      orderType,
      size: String(p.quantity ?? 0),
    };

    if (p.type === "LIMIT") {
      params.orderType = "limit";
      params.price = String(p.price);
      params.force = p.timeInForce?.toLowerCase() ?? "gtc";
    } else if (p.type === "STOP_MARKET") {
      params.orderType = "market";
      params.triggerPrice = String(p.stopPrice);
      params.triggerType = "mark_price";
      return this.placePlanOrder(params, p);
    } else if (p.type === "TAKE_PROFIT_MARKET") {
      params.orderType = "market";
      params.triggerPrice = String(p.stopPrice);
      params.triggerType = "mark_price";
      return this.placePlanOrder(params, p);
    }

    const data = (await this.signedRequest("POST", "/api/v2/mix/order/place-order", params)) as { orderId: string };
    return {
      orderId: data.orderId, symbol: p.symbol, side: p.side,
      type: p.type, status: p.type === "MARKET" ? "FILLED" : "NEW",
      quantity: p.quantity ?? 0,
    };
  }

  private async placePlanOrder(params: Record<string, unknown>, p: OrderParams): Promise<OrderResult> {
    const data = (await this.signedRequest("POST", "/api/v2/mix/order/place-plan-order", {
      ...params,
      planType: p.type === "STOP_MARKET" ? "loss_plan" : "profit_plan",
    })) as { orderId: string };
    return {
      orderId: data.orderId, symbol: p.symbol, side: p.side,
      type: p.type, status: "NEW", quantity: p.quantity ?? 0,
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    await this.signedRequest("POST", "/api/v2/mix/order/cancel-order", {
      symbol, productType: "USDT-FUTURES", orderId,
    }).catch(() => {
      void this.signedRequest("POST", "/api/v2/mix/order/cancel-plan-order", {
        symbol, productType: "USDT-FUTURES", orderId,
      });
    });
  }
}

// ── Market Data ─────────────────────────────────────────────────────

class BitgetMarketData implements MarketDataAdapter {
  private readonly base = "https://api.bitget.com";
  private readonly wsBase = "wss://ws.bitget.com/v2/ws/public";

  async fetchKlines(
    symbol: string, interval: Timeframe,
    opts: { startMs?: number; endMs?: number; limit?: number } = {},
  ): Promise<Candle[]> {
    const gran = bitgetTf(interval);
    const step = TF_MS[interval];
    const end = opts.endMs ?? Date.now();
    const startMs = opts.startMs ?? end - step * (opts.limit ?? 1500);
    const byTime = new Map<number, Candle>();

    // Walk backwards from `end`; Bitget limits how far back a single window may reach.
    let cursorEnd = end;
    for (let page = 0; page < 1500 && cursorEnd > startMs; page++) {
      const rows = await this.fetchPage(symbol, gran, cursorEnd);
      if (rows.length === 0) break;
      let oldest = Infinity;
      for (const k of rows) {
        const openTime = Number(k[0]);
        oldest = Math.min(oldest, openTime);
        if (openTime < startMs) continue;
        byTime.set(openTime, {
          openTime,
          open: Number(k[1]), high: Number(k[2]),
          low: Number(k[3]), close: Number(k[4]),
          volume: Number(k[5]),
          closeTime: openTime + step - 1,
        });
      }
      if (oldest >= cursorEnd) break;
      cursorEnd = oldest;
      await new Promise((r) => setTimeout(r, 120));
    }
    return [...byTime.values()].sort((a, b) => a.openTime - b.openTime);
  }

  private async fetchPage(symbol: string, gran: string, endTime: number): Promise<string[][]> {
    const q = `symbol=${symbol}&productType=USDT-FUTURES&granularity=${gran}&endTime=${endTime}`;
    let res = await fetch(`${this.base}/api/v2/mix/market/candles?${q}&limit=1000`);
    if (res.status === 400) {
      res = await fetch(`${this.base}/api/v2/mix/market/history-candles?${q}&limit=200`);
    }
    if (!res.ok) {
      throw new Error(`bitget klines ${symbol} ${gran} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    const json = (await res.json()) as { code: string; msg?: string; data: string[][] };
    if (json.code !== "00000") throw new Error(`bitget klines ${symbol} ${gran}: ${json.code} ${json.msg ?? ""}`);
    return json.data ?? [];
  }

  klineWsUrl(): string {
    return this.wsBase;
  }

  parseKlineWsMessage(raw: string): { symbol: string; tf: Timeframe; candle: Candle; isClosed: boolean } | null {
    let msg: { action?: string; arg?: { instId?: string; channel?: string }; data?: Array<string[]> };
    try { msg = JSON.parse(raw); } catch { return null; }
    if (msg.action !== "snapshot" && msg.action !== "update") return null;
    const d = msg.data?.[0];
    const symbol = msg.arg?.instId;
    if (!d || !symbol) return null;

    const channel = msg.arg?.channel ?? "";
    const tfMatch = channel.replace("candle", "");
    const reverseTf = Object.entries(TF_MAP).find(([, v]) => v === tfMatch);
    const tf = (reverseTf?.[0] ?? tfMatch.toLowerCase()) as Timeframe;
    const step = TF_MS[tf] ?? 0;

    const openTime = Number(d[0]);
    return {
      symbol,
      tf,
      candle: {
        openTime,
        open: Number(d[1]), high: Number(d[2]),
        low: Number(d[3]), close: Number(d[4]),
        volume: Number(d[5]),
        closeTime: openTime + step - 1,
      },
      isClosed: d[8] === "1",
    };
  }
}

// ── Order Flow ──────────────────────────────────────────────────────

class BitgetOrderFlow implements OrderFlowAdapter {
  private readonly base = "https://api.bitget.com";

  async fetchOpenInterest(symbol: string): Promise<number> {
    const url = `${this.base}/api/v2/mix/market/open-interest?symbol=${symbol}&productType=USDT-FUTURES`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`bitget OI ${symbol} HTTP ${res.status}`);
    const json = (await res.json()) as { code: string; data: { openInterestList: Array<{ size: string }> } };
    if (json.code !== "00000") throw new Error(`bitget OI: ${json.code}`);
    return Number(json.data?.openInterestList?.[0]?.size ?? 0);
  }

  async fetchFundingRate(symbol: string): Promise<number> {
    const url = `${this.base}/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=USDT-FUTURES`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`bitget funding ${symbol} HTTP ${res.status}`);
    const json = (await res.json()) as { code: string; data: Array<{ fundingRate: string }> };
    if (json.code !== "00000") throw new Error(`bitget funding: ${json.code}`);
    return Number(json.data?.[0]?.fundingRate ?? 0) * 100;
  }

  async fetchLongShortRatio(symbol: string): Promise<number> {
    const url = `${this.base}/api/v2/mix/market/account-long-short?symbol=${symbol}&productType=USDT-FUTURES&period=15m`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`bitget LS ratio ${symbol} HTTP ${res.status}`);
    const json = (await res.json()) as { code: string; data: Array<{ longShortRatio: string }> };
    if (json.code !== "00000") throw new Error(`bitget LS: ${json.code}`);
    return Number(json.data?.[0]?.longShortRatio ?? 1);
  }
}

// ── User Stream ─────────────────────────────────────────────────────

class BitgetUserStream implements UserStreamAdapter {
  private readonly wsUrl = "wss://ws.bitget.com/v2/ws/private";
  private ws: WebSocket | null = null;
  private handlers: Array<(e: UserDataEvent) => void> = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private apiKey = "";
  private apiSecret = "";
  private passphrase = "";

  constructor(private readonly opts: BitgetOptions) {
    this.apiKey = opts.apiKey;
    this.apiSecret = opts.apiSecret;
    this.passphrase = opts.passphrase;
  }

  onEvent(fn: (e: UserDataEvent) => void): void {
    this.handlers.push(fn);
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on("open", () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = createHmac("sha256", this.apiSecret)
        .update(ts + "GET" + "/user/verify")
        .digest("base64");

      this.ws!.send(JSON.stringify({
        op: "login",
        args: [{ apiKey: this.apiKey, passphrase: this.passphrase, timestamp: ts, sign: sig }],
      }));

      setTimeout(() => {
        this.ws!.send(JSON.stringify({
          op: "subscribe",
          args: [{ instType: "USDT-FUTURES", channel: "orders", instId: "default" }],
        }));
      }, 1000);

      this.pingInterval = setInterval(() => this.ws?.send("ping"), 25_000);
    });

    this.ws.on("message", (raw: WebSocket.RawData) => {
      const text = raw.toString();
      if (text === "pong") return;
      this.handleMessage(text);
    });
    this.ws.on("close", () => setTimeout(() => void this.connect(), 2000));
    this.ws.on("error", (e: Error) => console.error("[bitget-ws] error", e.message));
  }

  private handleMessage(raw: string): void {
    let msg: { action?: string; arg?: { channel?: string }; data?: Array<Record<string, string>> };
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.arg?.channel !== "orders" || !msg.data) return;

    for (const d of msg.data) {
      const statusMap: Record<string, string> = {
        live: "NEW", partially_filled: "PARTIALLY_FILLED",
        filled: "FILLED", cancelled: "CANCELED",
      };
      const ev: UserDataEvent = {
        type: "fill",
        symbol: d.instId ?? "",
        orderId: d.ordId ?? "",
        side: (d.side ?? "").toUpperCase() as "BUY" | "SELL",
        orderType: d.ordType ?? "",
        status: (statusMap[d.state ?? ""] ?? "NEW") as "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED",
        lastFilledQty: Number(d.fillSz ?? 0),
        avgPrice: Number(d.fillPx ?? d.avgPx ?? 0),
        realizedPnl: Number(d.pnl ?? 0),
        timestamp: Number(d.uTime ?? Date.now()),
      };
      for (const h of this.handlers) h(ev);
    }
  }

  close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.ws?.close();
  }
}

// ── Factory ─────────────────────────────────────────────────────────

export function createBitgetAdapter(opts: BitgetOptions): ExchangeAdapter {
  return {
    name: "bitget",
    client: new BitgetClient(opts),
    marketData: new BitgetMarketData(),
    orderFlow: new BitgetOrderFlow(),
    userStream: new BitgetUserStream(opts),
  };
}
