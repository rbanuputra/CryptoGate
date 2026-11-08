/**
 * Module 5: Strategy Selector.
 * Maps the current regime -> which strategies are active (with weight +
 * direction policy), and scores individual signals for ranking.
 */
import {
  MarketRegime,
  type Direction,
  type RegimeResult,
  type Signal,
  type SignalDirectionPolicy,
  type StrategyConfigEntry,
  type StrategyName,
} from "@cryptogate/shared";

export const REGIME_STRATEGY_MAP: Record<MarketRegime, StrategyConfigEntry[]> = {
  [MarketRegime.TRENDING_UP]: [
    { strategy: "smc_sweep", weight: 1.0, direction: "long_only" },
    { strategy: "momentum_breakout", weight: 0.9, direction: "long_bias" },
    { strategy: "vwap_bounce", weight: 0.8, direction: "long_only" },
    { strategy: "oi_divergence", weight: 0.5, direction: "both" },
  ],
  [MarketRegime.TRENDING_DOWN]: [
    { strategy: "smc_sweep", weight: 1.0, direction: "short_only" },
    { strategy: "momentum_breakout", weight: 0.9, direction: "short_bias" },
    { strategy: "vwap_bounce", weight: 0.8, direction: "short_only" },
    { strategy: "oi_divergence", weight: 0.5, direction: "both" },
  ],
  [MarketRegime.RANGING]: [
    { strategy: "mean_reversion", weight: 1.0, direction: "both" },
    { strategy: "vwap_bounce", weight: 0.7, direction: "both" },
    { strategy: "oi_divergence", weight: 0.5, direction: "both" },
  ],
  [MarketRegime.HIGH_VOLATILITY]: [
    { strategy: "liquidation_fade", weight: 1.0, direction: "both" },
    { strategy: "oi_divergence", weight: 0.9, direction: "both" },
    { strategy: "momentum_breakout", weight: 0.7, direction: "both" },
  ],
  [MarketRegime.LOW_VOLATILITY]: [
    { strategy: "oi_divergence", weight: 0.5, direction: "both" },
  ],
};

export function getActiveStrategies(regime: MarketRegime): StrategyConfigEntry[] {
  return REGIME_STRATEGY_MAP[regime] ?? [];
}

export function isStrategyActive(regime: MarketRegime, strategy: StrategyName): boolean {
  return getActiveStrategies(regime).some((s) => s.strategy === strategy);
}

/** Whether a direction is permitted by a policy (strict-only policies gate it). */
export function directionAllowed(policy: SignalDirectionPolicy, dir: Direction): boolean {
  switch (policy) {
    case "long_only":
      return dir === "long";
    case "short_only":
      return dir === "short";
    case "long_bias":
    case "short_bias":
    case "both":
      return true;
  }
}

export interface ScoreContext {
  multiStrategyConfirm: boolean;
  isKeyLevel: boolean;
  hasCorrelatedPosition: boolean;
  dailyLossApproaching: boolean;
}

/** Composite signal score used to rank competing signals (Module 5). */
export function scoreSignal(
  signal: Signal,
  regime: RegimeResult,
  ctx: ScoreContext,
  /** override the regime map entry (used when regime switching is off) */
  entry?: StrategyConfigEntry,
): number {
  const cfg = entry ?? getActiveStrategies(regime.regime).find((s) => s.strategy === signal.strategy);
  if (!cfg) return 0; // strategy not active in this regime

  let score = signal.confidence * cfg.weight * Math.max(regime.confidence, 0.01);

  if (signal.riskReward > 3.0) score *= 1.2;
  if (ctx.multiStrategyConfirm) score *= 1.3;
  if (ctx.isKeyLevel) score *= 1.1;

  if (!directionAllowed(cfg.direction, signal.direction)) score *= 0.3;
  if (ctx.hasCorrelatedPosition) score *= 0.5;
  if (ctx.dailyLossApproaching) score *= 0.5;

  return score;
}
