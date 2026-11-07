/**
 * Binance USDⓈ-M user data stream — real-time order fills and account updates.
 * `parseUserDataMessage` is a pure decoder (unit-tested); `UserDataStream`
 * handles the listenKey lifecycle + socket (runtime network).
 */
import WebSocket from "ws";

export interface OrderFillEvent {
  type: "fill";
  symbol: string;
  orderId: string;
  side: "BUY" | "SELL";
  orderType: string;
  status: "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "EXPIRED";
  lastFilledQty: number;
  avgPrice: number;
  realizedPnl: number;
  timestamp: number;
}

export interface AccountUpdateEvent {
  type: "account";
  balances: Array<{ asset: string; walletBalance: number }>;
  timestamp: number;
}

export type UserDataEvent = OrderFillEvent | AccountUpdateEvent;

interface RawOrderUpdate {
  e: "ORDER_TRADE_UPDATE";
  E: number;
  o: { s: string; i: number; S: "BUY" | "SELL"; o: string; X: string; l: string; ap: string; rp: string };
}
interface RawAccountUpdate {
  e: "ACCOUNT_UPDATE";
  E: number;
  a: { B: Array<{ a: string; wb: string }> };
}

export function parseUserDataMessage(raw: string): UserDataEvent | null {
  let msg: RawOrderUpdate | RawAccountUpdate;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (msg.e === "ORDER_TRADE_UPDATE") {
    const o = msg.o;
    return {
      type: "fill",
      symbol: o.s,
      orderId: String(o.i),
      side: o.S,
      orderType: o.o,
      status: o.X as OrderFillEvent["status"],
      lastFilledQty: Number(o.l),
      avgPrice: Number(o.ap),
      realizedPnl: Number(o.rp),
      timestamp: msg.E,
    };
  }
  if (msg.e === "ACCOUNT_UPDATE") {
    return {
      type: "account",
      balances: msg.a.B.map((b) => ({ asset: b.a, walletBalance: Number(b.wb) })),
      timestamp: msg.E,
    };
  }
  return null;
}

export interface UserStreamOptions {
  apiKey: string;
  testnet?: boolean;
}

export class UserDataStream {
  private readonly rest: string;
  private readonly wsBase: string;
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private handlers: Array<(e: UserDataEvent) => void> = [];

  constructor(private readonly opts: UserStreamOptions) {
    this.rest = opts.testnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
    this.wsBase = opts.testnet ? "wss://stream.binancefuture.com/ws/" : "wss://fstream.binance.com/ws/";
  }

  onEvent(fn: (e: UserDataEvent) => void): void {
    this.handlers.push(fn);
  }

  async connect(): Promise<void> {
    const res = await fetch(`${this.rest}/fapi/v1/listenKey`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": this.opts.apiKey },
    });
    if (!res.ok) throw new Error(`listenKey HTTP ${res.status}`);
    this.listenKey = ((await res.json()) as { listenKey: string }).listenKey;
    this.ws = new WebSocket(this.wsBase + this.listenKey);
    this.ws.on("message", (raw: WebSocket.RawData) => {
      const ev = parseUserDataMessage(raw.toString());
      if (ev) for (const h of this.handlers) h(ev);
    });
    this.ws.on("close", () => setTimeout(() => void this.connect(), 2000));
    // keepalive every 30 min
    this.keepAlive = setInterval(() => void this.ping(), 30 * 60 * 1000);
  }

  private async ping(): Promise<void> {
    if (!this.listenKey) return;
    await fetch(`${this.rest}/fapi/v1/listenKey`, { method: "PUT", headers: { "X-MBX-APIKEY": this.opts.apiKey } }).catch(() => {});
  }

  close(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.ws?.close();
  }
}
