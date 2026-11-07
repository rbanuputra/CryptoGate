/** Historical candle loading: Binance USDⓈ-M klines (REST, paginated) or CSV. */
import { readFileSync } from "node:fs";
import { TF_MS, type Candle, type Timeframe } from "@cryptogate/shared";

const FAPI = "https://fapi.binance.com/fapi/v1/klines";

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  opts: { startMs?: number; endMs?: number; limit?: number } = {},
): Promise<Candle[]> {
  const step = TF_MS[interval];
  const end = opts.endMs ?? Date.now();
  let cursor = opts.startMs ?? end - step * (opts.limit ?? 1500);
  const out: Candle[] = [];
  while (cursor < end) {
    const url = `${FAPI}?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${end}&limit=1500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`binance klines ${symbol} ${interval} HTTP ${res.status}`);
    const rows = (await res.json()) as unknown[][];
    if (rows.length === 0) break;
    for (const k of rows) {
      out.push({
        openTime: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
        closeTime: Number(k[6]),
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
