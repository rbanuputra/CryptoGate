import type { MarketRegime } from "./regime.js";

export type StrategyName =
  | "smc_sweep"
  | "momentum_breakout"
  | "mean_reversion"
  | "oi_divergence"
  | "vwap_bounce"
  | "liquidation_fade";

export type Direction = "long" | "short";

export interface Signal {
  id: string;
  strategy: StrategyName;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  entryType: "market" | "limit";
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  /** 0-1, strategy-specific */
  confidence: number;
  regime: MarketRegime;
  reasoning: string;
  timestamp: number;
  /** signal expires after this epoch-ms */
  expiry: number;
  /** optional extra context for logging/journal */
  meta?: Record<string, number | string | boolean | null>;
}

export type SignalDirectionPolicy =
  | "long_only"
  | "short_only"
  | "long_bias"
  | "short_bias"
  | "both";

export interface StrategyConfigEntry {
  strategy: StrategyName;
  weight: number;
  direction: SignalDirectionPolicy;
}
