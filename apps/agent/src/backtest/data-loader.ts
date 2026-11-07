/** Historical candle loading: exchange klines (REST, paginated) or CSV. */
import { readFileSync } from "node:fs";
import type { Candle, ExchangeName, Timeframe } from "@cryptogate/shared";
import type { MarketDataAdapter } from "../exchange/adapter.js";
import { createBinanceAdapter } from "../exchange/binance.js";
import { createBitgetAdapter } from "../exchange/bitget.js";
import { fetchKlinesCached } from "./candle-cache.js";

let _adapter: MarketDataAdapter | null = null;

export function setMarketDataAdapter(adapter: MarketDataAdapter): void {
  _adapter = adapter;
}

function getDefaultAdapter(exchange?: ExchangeName): MarketDataAdapter {
  if (_adapter) return _adapter;
  if (exchange === "bitget") {
    return createBitgetAdapter({
      apiKey: process.env.BITGET_API_KEY ?? "",
      apiSecret: process.env.BITGET_API_SECRET ?? "",
      passphrase: process.env.BITGET_PASSPHRASE ?? "",
    }).marketData;
  }
  return createBinanceAdapter({
    apiKey: process.env.BINANCE_API_KEY ?? "",
    apiSecret: process.env.BINANCE_API_SECRET ?? "",
  }).marketData;
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  opts: { startMs?: number; endMs?: number; limit?: number } = {},
  exchange?: ExchangeName,
): Promise<Candle[]> {
  return fetchKlinesCached(getDefaultAdapter(exchange), exchange ?? "binance", symbol, interval, opts);
}

/** CSV with header: timestamp,open,high,low,close,volume (timestamp epoch-ms). */
export function loadCsv(path: string): Candle[] {
  const text = readFileSync(path, "utf8").trim();
  const lines = text.split(/\r?\n/);
  const out: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(",");
    if (parts.length < 6) continue;
    out.push({
      openTime: Number(parts[0]),
      open: Number(parts[1]),
      high: Number(parts[2]),
      low: Number(parts[3]),
      close: Number(parts[4]),
      volume: Number(parts[5]),
    });
  }
  return out;
}
