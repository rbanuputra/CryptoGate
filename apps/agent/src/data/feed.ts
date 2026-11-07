/**
 * Module 1: Data Feed — REST bootstrap + exchange kline WebSocket.
 * Maintains a CandleBuffer per (symbol, timeframe) and emits on each closed bar.
 * Exchange-agnostic: uses MarketDataAdapter for REST + WS.
 */
import WebSocket from "ws";
import type { Candle, Timeframe } from "@cryptogate/shared";
import { CandleBuffer } from "./candle-buffer.js";
import type { MarketDataAdapter } from "../exchange/adapter.js";

type CloseHandler = (symbol: string, tf: Timeframe, buf: CandleBuffer) => void;

export class DataFeed {
  private buffers = new Map<string, CandleBuffer>();
  private ws: WebSocket | null = null;
  private handlers: CloseHandler[] = [];

  constructor(
    private readonly symbols: string[],
    private readonly timeframes: Timeframe[],
    private readonly marketData: MarketDataAdapter,
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

  async bootstrap(limit = 1500): Promise<void> {
    for (const symbol of this.symbols) {
      for (const tf of this.timeframes) {
        const candles = await this.marketData.fetchKlines(symbol, tf, { limit });
        const buf = new CandleBuffer(symbol, tf);
        buf.seed(candles);
        this.buffers.set(this.key(symbol, tf), buf);
      }
    }
  }

  connect(): void {
    const url = this.marketData.klineWsUrl(this.symbols, this.timeframes);
    this.ws = new WebSocket(url);

    // Bitget requires subscribe messages after connection
    this.ws.on("open", () => {
      if (url.includes("bitget")) {
        for (const symbol of this.symbols) {
          for (const tf of this.timeframes) {
            const tfMap: Record<string, string> = {
              "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
              "1h": "1H", "4h": "4H", "1d": "1D",
            };
            this.ws!.send(JSON.stringify({
              op: "subscribe",
              args: [{ instType: "USDT-FUTURES", channel: `candle${tfMap[tf] ?? tf}`, instId: symbol }],
            }));
          }
        }
      }
    });

    this.ws.on("message", (raw: WebSocket.RawData) => this.onMessage(raw));
    this.ws.on("close", () => setTimeout(() => this.connect(), 2000));
    this.ws.on("error", (e: Error) => console.error("[feed] ws error", e.message));
  }

  private onMessage(raw: WebSocket.RawData): void {
    const text = raw.toString();
    if (text === "pong") return;

    const parsed = this.marketData.parseKlineWsMessage(text);
    if (!parsed) return;

    const { symbol, tf, candle, isClosed } = parsed;
    const buf = this.buffers.get(this.key(symbol, tf));
    if (!buf) return;

    buf.update(candle, isClosed);
    if (isClosed) for (const h of this.handlers) h(symbol, tf, buf);
  }

  close(): void {
    this.ws?.close();
  }
}
