import type { Direction, MarketRegime, Signal, StrategyName } from "@cryptogate/shared";
import { signalId } from "./base.js";

export interface BuildSignalArgs {
  strategy: StrategyName;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  tp1Rr: number;
  tp2Rr: number;
  confidence: number;
  regime: MarketRegime;
  reasoning: string;
  timestamp: number;
  signalTtlMs: number;
  tp2Override?: number;
  meta?: Signal["meta"];
}

/** Build a shared Signal from a market-entry setup (entry at current close). */
export function buildSignal(a: BuildSignalArgs): Signal | null {
  const risk = Math.abs(a.entryPrice - a.stopLoss);
  if (risk <= 0) return null;
  const long = a.direction === "long";
  const tp1 = long ? a.entryPrice + a.tp1Rr * risk : a.entryPrice - a.tp1Rr * risk;
  const tp2 = a.tp2Override ?? (long ? a.entryPrice + a.tp2Rr * risk : a.entryPrice - a.tp2Rr * risk);
  const riskReward = Math.abs(tp2 - a.entryPrice) / risk;
  return {
    id: signalId(a.strategy, a.symbol, a.timestamp),
    strategy: a.strategy,
    symbol: a.symbol,
    direction: a.direction,
    entryPrice: a.entryPrice,
    entryType: "market",
    stopLoss: a.stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: Number(riskReward.toFixed(3)),
    confidence: a.confidence,
    regime: a.regime,
    reasoning: a.reasoning,
    timestamp: a.timestamp,
    expiry: a.timestamp + a.signalTtlMs,
    meta: a.meta,
  };
}

export function lastReal(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) if (!Number.isNaN(arr[i]!)) return arr[i]!;
  return NaN;
}
