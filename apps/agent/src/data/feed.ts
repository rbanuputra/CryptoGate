/**
 * Module 1: Data Feed — REST bootstrap + Binance combined kline WebSocket.
 * Maintains a CandleBuffer per (symbol, timeframe) and emits on each closed bar.
 */
import WebSocket from "ws";
import type { Candle, Timeframe } from "@cryptogate/shared";
import { CandleBuffer } from "./candle-buffer.js";
import { fetchKlines } from "../backtest/data-loader.js";

const WS_BASE = "wss://fstream.binance.com/stream?streams=";

type CloseHandler = (symbol: string, tf: Timeframe, buf: CandleBuffer) => void;

export class DataFeed {
  private buffers = new Map<string, CandleBuffer>();
  private ws: WebSocket | null = null;
  private handlers: CloseHandler[] = [];

  constructor(
    private readonly symbols: string[],
    private readonly timeframes: Timeframe[],
  ) {}

  private key(symbol: string, tf: Timeframe): string {
    return `${symbol}:${tf}`;
  }

  buffer(symbol: string, tf: Timeframe): CandleBuffer | undefined {
    return this.buffers.get(this.key(symbol, tf));
  }

  onCandleClose(fn: CloseHandler): void {
    this.handlers.push(fn);
  }

  /** Fetch history to initialize indicators for every (symbol, tf). */
  async bootstrap(limit = 1500): Promise<void> {
    for (const symbol of this.symbols) {
      for (const tf of this.timeframes) {
        const candles = await fetchKlines(symbol, tf, { limit });
        const buf = new CandleBuffer(symbol, tf);
        buf.seed(candles);
        this.buffers.set(this.key(symbol, tf), buf);
      }
    }
  }

  connect(): void {
    const streams = this.symbols
      .flatMap((s) => this.timeframes.map((tf) => `${s.toLowerCase()}@kline_${tf}`))
      .join("/");
    this.ws = new WebSocket(WS_BASE + streams);
    this.ws.on("message", (raw: WebSocket.RawData) => this.onMessage(raw));
    this.ws.on("close", () => setTimeout(() => this.connect(), 2000));
    this.ws.on("error", (e: Error) => console.error("[feed] ws error", e.message));
  }

  private onMessage(raw: WebSocket.RawData): void {
    let msg: { data?: { s: string; k: KlinePayload } };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const k = msg.data?.k;
    const symbol = msg.data?.s;
    if (!k || !symbol) return;
    const tf = k.i as Timeframe;
    const buf = this.buffers.get(this.key(symbol, tf));
    if (!buf) return;
    const candle: Candle = {
      openTime: k.t,
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
      closeTime: k.T,
    };
    buf.update(candle, k.x);
    if (k.x) for (const h of this.handlers) h(symbol, tf, buf);
  }

  close(): void {
    this.ws?.close();
  }
}

interface KlinePayload {
  t: number;
  T: number;
  i: string;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  x: boolean;
}
