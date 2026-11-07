/**
 * Disk cache for historical candles (backtests only; the live feed always fetches fresh).
 * One JSON file per exchange/symbol/timeframe. `coveredFrom` marks how far back the cache is
 * contiguous, so a repeat request only downloads the newest candles, and an interrupted
 * download resumes where it stopped.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TF_MS, type Candle, type Timeframe } from "@cryptogate/shared";
import type { MarketDataAdapter } from "../exchange/adapter.js";

export interface RangeOpts {
  startMs?: number;
  endMs?: number;
  limit?: number;
}

export interface CacheOpts {
  dir?: string;
  now?: number;
  budgetMs?: number;
  chunkBars?: number;
}

interface CacheFile {
  coveredFrom: number;
  candles: number[][];
}

export class CachePartialError extends Error {}

export function defaultCacheDir(): string {
  return process.env.CANDLE_CACHE_DIR ?? join(process.cwd(), "data", "candles");
}

const toRow = (c: Candle): number[] => [c.openTime, c.open, c.high, c.low, c.close, c.volume, c.closeTime ?? 0];
const fromRow = (r: number[]): Candle => ({
  openTime: r[0]!, open: r[1]!, high: r[2]!, low: r[3]!, close: r[4]!, volume: r[5]!, closeTime: r[6] || undefined,
});

function merge(a: Candle[], b: Candle[]): Candle[] {
  const m = new Map<number, Candle>();
  for (const c of a) m.set(c.openTime, c);
  for (const c of b) m.set(c.openTime, c);
  return [...m.values()].sort((x, y) => x.openTime - y.openTime);
}

function load(file: string): CacheFile | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CacheFile;
  } catch {
    return null;
  }
}

function save(file: string, coveredFrom: number, candles: Candle[]): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ coveredFrom, candles: candles.map(toRow) } satisfies CacheFile));
  renameSync(tmp, file);
}

export async function fetchKlinesCached(
  md: MarketDataAdapter,
  exchange: string,
  symbol: string,
  tf: Timeframe,
  opts: RangeOpts = {},
  cache: CacheOpts = {},
): Promise<Candle[]> {
  const step = TF_MS[tf];
  const dir = cache.dir ?? defaultCacheDir();
  const now = cache.now ?? Date.now();
  const deadline = Date.now() + (cache.budgetMs ?? 150_000);
  const chunk = (cache.chunkBars ?? 20_000) * step;
  const end = opts.endMs ?? now;
  const start = opts.startMs ?? end - step * (opts.limit ?? 1500);

  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${exchange}_${symbol}_${tf}.json`);
  const stored = load(file);
  let candles = stored ? stored.candles.map(fromRow) : [];
  let coveredFrom = stored?.coveredFrom ?? end;

  // Fill history backwards in chunks, saving after each so an interruption keeps progress.
  if (!stored || start < coveredFrom) {
    let cursorEnd = stored ? (candles[0]?.openTime ?? coveredFrom) : end;
    const total = Math.max(1, Math.ceil((cursorEnd - start) / chunk));
    let n = 0;
    while (cursorEnd > start) {
      if (Date.now() > deadline) {
        throw new CachePartialError(
          `History download in progress for ${symbol} ${tf} (cached back to ${new Date(coveredFrom).toISOString().slice(0, 10)}). Run again to continue.`,
        );
      }
      const chunkStart = Math.max(start, cursorEnd - chunk);
      console.log(`[cache] ${exchange} ${symbol} ${tf}: chunk ${++n}/${total}`);
      const rows = await md.fetchKlines(symbol, tf, { startMs: chunkStart, endMs: cursorEnd });
      candles = merge(rows, candles);
      if (rows.length === 0 && candles.length > 0) {
        coveredFrom = start;
        save(file, coveredFrom, candles);
        break;
      }
      coveredFrom = chunkStart;
      save(file, coveredFrom, candles);
      cursorEnd = chunkStart;
    }
  }

  // Top up the newest candles (the last cached one may have been partial).
  const lastOpen = candles[candles.length - 1]?.openTime ?? start;
  if (end > lastOpen) {
    candles = merge(candles, await md.fetchKlines(symbol, tf, { startMs: lastOpen, endMs: end }));
    save(file, coveredFrom, candles);
  }

  return candles.filter((c) => c.openTime >= start && c.openTime <= end);
}
