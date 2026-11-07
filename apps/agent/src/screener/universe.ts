/**
 * Module 2 — Layer 1: Universe Filter (runs daily).
 * Reduces the full USDⓈ-M futures universe (~200+ pairs) to a tradeable
 * watchlist. Pure filter over pre-fetched per-symbol metrics.
 */
import type { UniverseFilterConfig } from "@cryptogate/shared";

export const UNIVERSE_DEFAULT: UniverseFilterConfig = {
  minVolume24h: 50_000_000,
  minOpenInterest: 20_000_000,
  maxSpreadPct: 0.05,
  minListingAgeDays: 30,
  excludePatterns: ["USDCUSDT", "BUSDUSDT"],
};

export interface UniverseCandidate {
  symbol: string;
  quoteVolume24h: number;
  openInterestUsd: number;
  spreadPct: number;
  listingAgeDays: number;
}

export function filterUniverse(
  candidates: UniverseCandidate[],
  cfg: UniverseFilterConfig = UNIVERSE_DEFAULT,
  whitelist: string[] = [],
  blacklist: string[] = [],
): string[] {
  const wl = new Set(whitelist);
  const bl = new Set([...cfg.excludePatterns, ...blacklist]);
  const picked = candidates
    .filter((c) => !bl.has(c.symbol))
    .filter(
      (c) =>
        wl.has(c.symbol) ||
        (c.quoteVolume24h > cfg.minVolume24h &&
          c.openInterestUsd > cfg.minOpenInterest &&
          c.spreadPct < cfg.maxSpreadPct &&
          c.listingAgeDays > cfg.minListingAgeDays),
    )
    .map((c) => c.symbol);

  // ensure whitelist always present even if missing from candidates
  for (const w of whitelist) if (!bl.has(w) && !picked.includes(w)) picked.push(w);
  return [...new Set(picked)];
}
