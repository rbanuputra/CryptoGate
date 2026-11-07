import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "@cryptogate/shared";
import { detectSmcSignals, type SmcConfig } from "../src/strategies/smc-sweep.js";
import { backtestSmc, BACKTEST_DEFAULT } from "../src/backtest/runner.js";

const T0 = 1_700_000_000_000;
const STEP = 900_000; // 15m

function baselineChart(n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ openTime: T0 + i * STEP, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000 });
  }
  return out;
}

/** HTF series (same 15m spacing in-test) with one clear pivot low (BSL) at 98. */
function htfWithBslLow(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 80; i++) {
    const low = i === 10 ? 98 : 99.5;
    out.push({ openTime: T0 + i * STEP, open: 100, high: 100.5, low, close: 100, volume: 1000 });
  }
  return out;
}

/** Inject sweep -> bearish OB base -> bullish displacement -> retest around bar 58-62. */
function injectLongSetup(chart: Candle[]): void {
  chart[58] = { openTime: T0 + 58 * STEP, open: 100, high: 100.5, low: 97.6, close: 100.2, volume: 1500 }; // sweep BSL(98)
  chart[59] = { openTime: T0 + 59 * STEP, open: 100.4, high: 100.6, low: 99.4, close: 99.6, volume: 1200 }; // bearish (OB base)
  chart[60] = { openTime: T0 + 60 * STEP, open: 99.6, high: 102.6, low: 99.5, close: 102.5, volume: 3000 }; // bullish displacement
  chart[61] = { openTime: T0 + 61 * STEP, open: 102.0, high: 102.4, low: 101.9, close: 102.2, volume: 1000 };
  chart[62] = { openTime: T0 + 62 * STEP, open: 100.0, high: 101.0, low: 99.8, close: 100.8, volume: 1400 }; // OB retest -> LONG
  // rising ramp afterwards so the backtest can reach TP1
  let p = 101;
  for (let i = 63; i < chart.length; i++) {
    const open = p;
    p += 0.3;
    chart[i] = { openTime: T0 + i * STEP, open, high: p + 0.5, low: open - 0.5, close: p, volume: 1200 };
  }
}

const CFG: SmcConfig = {
  displacementMult: 1.8,
  sweepWickMin: 0.3,
  slBuffer: 0.3,
  tp1Rr: 1.5,
  tp2Rr: 4.0,
  cooldownBars: 3,
  chochRequired: false, // isolate the sweep->zone path
  zoneMaxAge: 50,
  swingLen: 5,
  sweepLookback: 20,
  obEnabled: true,
  fvgEnabled: true,
  sessionFilter: false, // deterministic regardless of synthetic timestamps
};

test("SMC detects a long signal on the OB retest after a BSL sweep", () => {
  const chart = baselineChart(160);
  injectLongSetup(chart);
  const htf = htfWithBslLow();
  const signals = detectSmcSignals(chart, htf, "15m", CFG);
  const atRetest = signals.find((s) => s.barIndex === 62 && s.direction === "long");
  assert.ok(atRetest, `expected a long signal at bar 62; got ${JSON.stringify(signals.map((s) => [s.barIndex, s.direction]))}`);
  assert.ok(["OB", "FVG"].includes(atRetest!.zoneKind));
  assert.ok(atRetest!.slPrice < 98, "SL should sit below the swept wick");
});

test("backtest produces at least one executed trade on the fixture", () => {
  const chart = baselineChart(160);
  injectLongSetup(chart);
  const htf = htfWithBslLow();
  const res = backtestSmc(chart, htf, "15m", { ...BACKTEST_DEFAULT, smc: CFG });
  assert.ok(res.trades.length >= 1, "expected >=1 trade");
  assert.equal(res.trades[0]!.direction, "long");
  assert.ok(Number.isFinite(res.finalEquity));
});

test("no signals on flat baseline (no sweep, no displacement)", () => {
  const chart = baselineChart(160);
  const htf = htfWithBslLow();
  const signals = detectSmcSignals(chart, htf, "15m", CFG);
  assert.equal(signals.length, 0);
});
