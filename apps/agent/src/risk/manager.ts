/**
 * Module 7: Risk Manager.
 * Position sizing (20x / 25% margin risk) + all gating checks: concurrency,
 * one-per-symbol, correlation, drawdown scaling, daily circuit breaker,
 * spread, min R:R, and confidence-based sizing.
 */
import { clamp, roundToStep, type PositionSize, type Signal } from "@cryptogate/shared";
import { countCorrelatedPositions, type OpenLike } from "./correlation.js";
import { CircuitBreaker, CIRCUIT_DEFAULT, type CircuitBreakerConfig } from "./circuit-breaker.js";

export interface RiskConfig {
  leverage: number;
  riskPct: number;
  maxConcurrentPositions: number;
  maxCorrelatedPositions: number;
  maxSpreadPct: number;
  minRiskReward: number;
  drawdownThresholds: Array<{ drawdown: number; sizeMultiplier: number }>;
  circuit: CircuitBreakerConfig;
}

export const RISK_DEFAULT: RiskConfig = {
  leverage: 20,
  riskPct: 0.25,
  maxConcurrentPositions: 3,
  maxCorrelatedPositions: 2,
  maxSpreadPct: 0.05,
  minRiskReward: 2.0,
  drawdownThresholds: [
    { drawdown: 0.3, sizeMultiplier: 0 },
    { drawdown: 0.2, sizeMultiplier: 0.5 },
    { drawdown: 0.1, sizeMultiplier: 0.75 },
  ],
  circuit: CIRCUIT_DEFAULT,
};

export function drawdownSizeMultiplier(dd: number, cfg: RiskConfig): number {
  for (const t of cfg.drawdownThresholds) if (dd > t.drawdown) return t.sizeMultiplier;
  return 1.0;
}

/** PRD confidence-based sizing. */
export function confidenceSizeMultiplier(signal: Signal, multiConfirm: boolean): number {
  if (signal.confidence > 0.8 && multiConfirm) return 1.0;
  if (signal.confidence > 0.6) return 0.75;
  return 0.5;
}

export function calculatePositionSize(
  entry: number,
  stopLoss: number,
  equity: number,
  cfg: RiskConfig,
  sizeMultiplier: number,
  stepSize = 0.001,
): PositionSize {
  const margin = equity;
  const riskAmount = margin * cfg.riskPct * sizeMultiplier;
  const slDistancePct = Math.abs(entry - stopLoss) / entry;
  const rawNotional = slDistancePct > 0 ? riskAmount / slDistancePct : 0;
  const maxNotional = margin * cfg.leverage;
  const finalNotional = Math.min(rawNotional, maxNotional);
  const quantity = roundToStep(finalNotional / entry, stepSize);
  return {
    notional: Number((quantity * entry).toFixed(4)),
    quantity,
    margin: Number((finalNotional / cfg.leverage).toFixed(4)),
    riskAmount: Number(riskAmount.toFixed(4)),
    leverageUsed: Number((finalNotional / margin).toFixed(4)),
  };
}

export interface RiskContext {
  equity: number;
  peakEquity: number;
  openPositions: OpenLike[];
  multiConfirm: boolean;
  spreadPct?: number;
  /** extra 0-1 multiplier from the pre-trade filter (Layer 3) */
  pretradeSizeAdj?: number;
  stepSize?: number;
  now?: number;
}

export interface RiskDecision {
  approved: boolean;
  reason?: string;
  positionSize?: PositionSize;
  sizeMultiplier?: number;
}

export class RiskManager {
  readonly breaker: CircuitBreaker;
  constructor(
    private readonly cfg: RiskConfig = RISK_DEFAULT,
    startEquity = 10_000,
    now = Date.now(),
  ) {
    this.breaker = new CircuitBreaker(cfg.circuit, startEquity, now);
  }

  evaluate(signal: Signal, ctx: RiskContext): RiskDecision {
    const now = ctx.now ?? Date.now();
    this.breaker.tick(now, ctx.equity);

    if (signal.riskReward < this.cfg.minRiskReward)
      return { approved: false, reason: `R:R ${signal.riskReward} < ${this.cfg.minRiskReward}` };
    if (ctx.spreadPct !== undefined && ctx.spreadPct > this.cfg.maxSpreadPct)
      return { approved: false, reason: `Spread ${ctx.spreadPct}% too wide` };
    if (ctx.openPositions.length >= this.cfg.maxConcurrentPositions)
      return { approved: false, reason: "Max concurrent positions" };
    if (ctx.openPositions.some((p) => p.symbol === signal.symbol))
      return { approved: false, reason: "Already in a position on this symbol" };

    const breaker = this.breaker.canTrade();
    if (!breaker.ok) return { approved: false, reason: breaker.reason };

    if (countCorrelatedPositions(signal.symbol, signal.direction, ctx.openPositions) >= this.cfg.maxCorrelatedPositions)
      return { approved: false, reason: "Too many correlated positions" };

    const dd = ctx.peakEquity > 0 ? (ctx.peakEquity - ctx.equity) / ctx.peakEquity : 0;
    const ddMult = drawdownSizeMultiplier(dd, this.cfg);
    if (ddMult === 0) return { approved: false, reason: `Drawdown ${(dd * 100).toFixed(1)}% — trading halted` };

    const confMult = confidenceSizeMultiplier(signal, ctx.multiConfirm);
    const sizeMultiplier = clamp(ddMult * confMult * (ctx.pretradeSizeAdj ?? 1), 0, 1);

    const positionSize = calculatePositionSize(
      signal.entryPrice,
      signal.stopLoss,
      ctx.equity,
      this.cfg,
      sizeMultiplier,
      ctx.stepSize,
    );
    if (positionSize.quantity <= 0) return { approved: false, reason: "Position size rounds to zero" };

    return { approved: true, positionSize, sizeMultiplier };
  }

  onOpen(): void {
    this.breaker.recordOpen();
  }
  onClose(pnl: number): void {
    this.breaker.recordClose(pnl);
  }
}
