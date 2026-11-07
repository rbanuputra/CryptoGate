/**
 * Module 2 — Layer 3: Pre-Trade Filter (right before execution).
 * Final liquidity / correlation / funding checks, returning a size adjustment.
 * Pure: pass the live measurements in.
 */
import type { Direction } from "@cryptogate/shared";

export interface PreTradeConfig {
  maxSpreadPct: number;
  minDepthUsdt: number;
  maxCorrelatedPositions: number;
  fundingRateWarningThreshold: number;
}

export const PRETRADE_DEFAULT: PreTradeConfig = {
  maxSpreadPct: 0.03,
  minDepthUsdt: 50_000,
  maxCorrelatedPositions: 2,
  fundingRateWarningThreshold: 0.03,
};

export interface PreTradeInput {
  symbol: string;
  direction: Direction;
  spreadPct: number;
  depthUsdt: number;
  correlatedPositions: number;
  fundingRate: number;
  inActiveScanList: boolean;
}

export interface PreTradeResult {
  pass: boolean;
  reason?: string;
  sizeAdjustment: number; // 0-1 multiplier
}

export function preTradeCheck(input: PreTradeInput, cfg: PreTradeConfig = PRETRADE_DEFAULT): PreTradeResult {
  if (!input.inActiveScanList) {
    return { pass: false, reason: "Not in active scan list", sizeAdjustment: 0 };
  }
  if (input.spreadPct > cfg.maxSpreadPct) {
    return { pass: false, reason: `Spread too wide: ${input.spreadPct}%`, sizeAdjustment: 0 };
  }
  if (input.depthUsdt < cfg.minDepthUsdt) {
    return { pass: false, reason: `Thin orderbook: $${Math.round(input.depthUsdt)}`, sizeAdjustment: 0 };
  }
  if (input.correlatedPositions >= cfg.maxCorrelatedPositions) {
    return { pass: false, reason: `Already ${input.correlatedPositions} correlated positions`, sizeAdjustment: 0 };
  }

  let sizeAdjustment = 1.0;
  if (Math.abs(input.fundingRate) > cfg.fundingRateWarningThreshold) sizeAdjustment = 0.5;
  // extra penalty for entering the crowded side
  if (input.direction === "long" && input.fundingRate > 0.05) sizeAdjustment = 0.3;
  if (input.direction === "short" && input.fundingRate < -0.03) sizeAdjustment = 0.3;

  return { pass: true, sizeAdjustment };
}
