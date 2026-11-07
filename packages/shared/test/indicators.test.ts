import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sma,
  ema,
  rsi,
  atr,
  bollinger,
  adx,
  pivots,
  type Candle,
} from "../src/index.js";

function synth(n: number, start = 100, drift = 0.1): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const open = p;
    p += drift + Math.sin(i / 5) * 0.5;
    const close = p;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    out.push({ openTime: i * 900_000, open, high, low, close, volume: 1000 + i });
  }
  return out;
}

test("sma computes trailing average", () => {
  const r = sma([2, 4, 6, 8, 10], 2);
  assert.ok(Number.isNaN(r[0]!));
  assert.equal(r[1], 3);
  assert.equal(r[4], 9);
});

test("ema seeds with first value and tracks", () => {
  const r = ema([10, 10, 10, 10], 3);
  assert.equal(r[0], 10);
  assert.ok(Math.abs(r[3]! - 10) < 1e-9);
});

test("rsi stays within 0..100 and is high for uptrend", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
  const r = rsi(closes, 14);
  const last = r[r.length - 1]!;
  assert.ok(last > 90 && last <= 100, `rsi=${last}`);
});

test("atr is positive once seeded", () => {
  const a = atr(synth(60), 14);
  const last = a[a.length - 1]!;
  assert.ok(last > 0 && Number.isFinite(last));
});

test("bollinger upper>middle>lower", () => {
  const closes = synth(60).map((c) => c.close);
  const bb = bollinger(closes, 20, 2);
  const last = bb[bb.length - 1]!;
  assert.ok(last.upper > last.middle && last.middle > last.lower);
  assert.ok(last.width > 0);
});

test("adx finite and in 0..100 for trending data", () => {
  const candles = synth(80, 100, 1.0);
  const a = adx(candles, 14);
  const last = a[a.length - 1]!;
  assert.ok(last >= 0 && last <= 100, `adx=${last}`);
});

test("pivots flags a clear local high", () => {
  const highs = [1, 2, 3, 5, 3, 2, 1];
  const lows = [1, 2, 3, 5, 3, 2, 1];
  const p = pivots(highs, lows, 2, 2);
  assert.equal(p[3]!.isHigh, true);
});
