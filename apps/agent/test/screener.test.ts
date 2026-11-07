import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateMomentumScore, getActiveScanList } from "../src/screener/momentum.js";
import { filterUniverse, UNIVERSE_DEFAULT } from "../src/screener/universe.js";
import { preTradeCheck } from "../src/screener/pretrade.js";

test("momentum score rewards the 2-8% move + volume/ATR/OI expansion sweet spot", () => {
  const hot = calculateMomentumScore({
    symbol: "SOLUSDT", priceChange4h: 0.034, volumeRatio: 2.5, atrRatio: 1.6, oiChange4h: 0.042, adx: 32, bbWidth: 0.03,
  });
  const dead = calculateMomentumScore({
    symbol: "XRPUSDT", priceChange4h: 0.001, volumeRatio: 0.8, atrRatio: 0.9, oiChange4h: 0.005, adx: 15, bbWidth: 0.05,
  });
  assert.ok(hot.score > dead.score);
  assert.ok(hot.score > 0 && hot.score <= 1.3);
  assert.equal(hot.symbol, "SOLUSDT");
});

test("getActiveScanList returns top-N by score", () => {
  const scores = ["A", "B", "C", "D"].map((s, i) =>
    calculateMomentumScore({ symbol: s, priceChange4h: 0.03, volumeRatio: i, atrRatio: 1, oiChange4h: 0.03, adx: 28, bbWidth: 0.05 }),
  );
  const top = getActiveScanList(scores, 2);
  assert.equal(top.length, 2);
  assert.ok(top[0]!.score >= top[1]!.score);
});

test("universe filter drops low-volume/stablecoins but keeps whitelist", () => {
  const out = filterUniverse(
    [
      { symbol: "BTCUSDT", quoteVolume24h: 2e9, openInterestUsd: 1e9, spreadPct: 0.01, listingAgeDays: 2000 },
      { symbol: "DEADUSDT", quoteVolume24h: 1e6, openInterestUsd: 1e5, spreadPct: 0.2, listingAgeDays: 5 },
      { symbol: "USDCUSDT", quoteVolume24h: 5e9, openInterestUsd: 1e9, spreadPct: 0.01, listingAgeDays: 2000 },
    ],
    UNIVERSE_DEFAULT,
    ["SOLUSDT"],
  );
  assert.ok(out.includes("BTCUSDT"));
  assert.ok(out.includes("SOLUSDT")); // whitelist forced in
  assert.ok(!out.includes("DEADUSDT"));
  assert.ok(!out.includes("USDCUSDT")); // stablecoin excluded
});

test("pre-trade check gates spread/depth/scan-list and reduces size on extreme funding", () => {
  const base = {
    symbol: "BTCUSDT", direction: "long" as const, spreadPct: 0.01,
    depthUsdt: 100_000, correlatedPositions: 0, fundingRate: 0.001, inActiveScanList: true,
  };
  assert.equal(preTradeCheck(base).pass, true);
  assert.equal(preTradeCheck({ ...base, inActiveScanList: false }).pass, false);
  assert.equal(preTradeCheck({ ...base, spreadPct: 0.1 }).pass, false);
  assert.equal(preTradeCheck({ ...base, depthUsdt: 1000 }).pass, false);
  assert.equal(preTradeCheck({ ...base, fundingRate: 0.06 }).sizeAdjustment, 0.3); // crowded long
  assert.equal(preTradeCheck({ ...base, fundingRate: 0.04 }).sizeAdjustment, 0.5);
});
