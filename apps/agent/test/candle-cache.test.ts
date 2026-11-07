import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candle } from "@cryptogate/shared";
import type { MarketDataAdapter } from "../src/exchange/adapter.js";
import { CachePartialError, fetchKlinesCached } from "../src/backtest/candle-cache.js";

const H = 3_600_000;
const T0 = Date.UTC(2026, 0, 1);
const NOW = T0 + 1000 * H;

function fakeAdapter(listedAt: number, failOnCall?: number) {
  const calls: Array<{ startMs?: number; endMs?: number }> = [];
  const md: MarketDataAdapter = {
    async fetchKlines(_s, _tf, opts = {}) {
      calls.push({ startMs: opts.startMs, endMs: opts.endMs });
      if (failOnCall !== undefined && calls.length === failOnCall) throw new Error("boom");
      const out: Candle[] = [];
      const from = Math.max(opts.startMs ?? 0, listedAt);
      for (let t = Math.ceil(from / H) * H; t <= (opts.endMs ?? NOW); t += H) {
        out.push({ openTime: t, open: 1, high: 2, low: 0.5, close: t / 1e9, volume: 1, closeTime: t + H - 1 });
      }
      return out;
    },
    klineWsUrl: () => "",
    parseKlineWsMessage: () => null,
  };
  return { md, calls };
}

const tmp = () => mkdtempSync(join(tmpdir(), "cg-cache-"));

test("repeat request only downloads the newest candles", async () => {
  const dir = tmp();
  const { md, calls } = fakeAdapter(0);
  const first = await fetchKlinesCached(md, "x", "BTCUSDT", "1h", { startMs: T0, endMs: NOW }, { dir, now: NOW });
  assert.equal(first.length, 1001);
  const before = calls.length;
  const again = await fetchKlinesCached(md, "x", "BTCUSDT", "1h", { startMs: T0, endMs: NOW + 5 * H }, { dir, now: NOW + 5 * H });
  assert.equal(calls.length, before + 1, "one tail call only");
  assert.equal(calls[calls.length - 1]!.startMs, NOW);
  assert.equal(again.length, 1006);
});

test("older start fills only the missing head", async () => {
  const dir = tmp();
  const { md, calls } = fakeAdapter(0);
  await fetchKlinesCached(md, "x", "BTCUSDT", "1h", { startMs: T0 + 500 * H, endMs: NOW }, { dir, now: NOW });
  calls.length = 0;
  const all = await fetchKlinesCached(md, "x", "BTCUSDT", "1h", { startMs: T0, endMs: NOW }, { dir, now: NOW });
  assert.equal(all.length, 1001);
  assert.equal(calls[0]!.startMs, T0);
  assert.equal(calls[0]!.endMs, T0 + 500 * H);
});

test("symbol listed later than requested start: stops at first empty chunk", async () => {
  const dir = tmp();
  const { md, calls } = fakeAdapter(T0 + 900 * H);
  const out = await fetchKlinesCached(md, "x", "NEWUSDT", "1h", { startMs: T0 - 5000 * H, endMs: NOW }, { dir, now: NOW, chunkBars: 1000 });
  assert.equal(out[0]!.openTime, T0 + 900 * H);
  assert.ok(calls.length <= 4, `calls ${calls.length}`);
});

test("interrupted download keeps progress and resumes", async () => {
  const dir = tmp();
  const failing = fakeAdapter(0, 2);
  await assert.rejects(
    fetchKlinesCached(failing.md, "x", "BTCUSDT", "1h", { startMs: T0, endMs: NOW }, { dir, now: NOW, chunkBars: 400 }),
    /boom/,
  );
  const ok = fakeAdapter(0);
  const out = await fetchKlinesCached(ok.md, "x", "BTCUSDT", "1h", { startMs: T0, endMs: NOW }, { dir, now: NOW, chunkBars: 400 });
  assert.equal(out.length, 1001);
  assert.ok(ok.calls[0]!.endMs! < NOW, "resumed below the already-cached chunk instead of restarting");
});

test("exhausted time budget asks the user to run again", async () => {
  const { md } = fakeAdapter(0);
  await assert.rejects(
    fetchKlinesCached(md, "x", "BTCUSDT", "1h", { startMs: T0, endMs: NOW }, { dir: tmp(), now: NOW, budgetMs: -1 }),
    CachePartialError,
  );
});
