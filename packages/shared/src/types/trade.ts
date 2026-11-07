import type { Direction, Signal, StrategyName } from "./strategy.js";
import type { MarketRegime } from "./regime.js";

export type ExitType = "TP1" | "TP2" | "SL" | "SL_BE" | "MANUAL" | "EOD";

export interface Position {
  symbol: string;
  signal: Signal;
  direction: Direction;
  entryPrice: number;
  entryTime: number;
  quantity: number;
  notional: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  remainingQty: number;
  tp1Hit: boolean;
  status: "open" | "closed";
}

export interface Trade {
  id: string;
  symbol: string;
  strategy: StrategyName;
  regime: MarketRegime;
  direction: Direction;
  entryTime: number;
  exitTime?: number;
  entryPrice: number;
  exitPrice?: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  quantity: number;
  notional: number;
  pnlUsdt?: number;
  pnlPct?: number;
  rMultiple?: number;
  exitType?: ExitType;
  confidence: number;
  multiStrategyConfirm: boolean;
  reasoning?: string;
  equityAfter?: number;
}

export interface PositionSize {
  notional: number;
  quantity: number;
  margin: number;
  riskAmount: number;
  leverageUsed: number;
}
