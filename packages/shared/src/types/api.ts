import type { Direction, Signal, StrategyName } from "./strategy.js";
import type { Trade } from "./trade.js";
import type { MarketRegime } from "./regime.js";
import type { MomentumScore } from "./screener.js";

export type AgentRunState = "running" | "paused" | "stopped";

export interface AgentStatusDto {
  status: AgentRunState;
  mode: "live" | "paper";
  uptimeMs: number;
  activeCoins: string[];
  equity: number;
  peakEquity: number;
  openPositions: number;
}

export interface PositionView {
  symbol: string;
  direction: Direction;
  strategy: StrategyName;
  entryPrice: number;
  quantity: number;
  notional: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp1Hit: boolean;
  openedAt: number;
}

export interface SignalRecordDto {
  signal: Signal;
  status: "taken" | "rejected" | "expired" | "pending";
  score: number;
  rejectReason?: string;
}

export interface EquityPointDto {
  timestamp: number;
  equity: number;
  drawdownPct: number;
  positionCount: number;
}

export interface RegimeDto {
  timestamp: number;
  symbol: string;
  regime: MarketRegime;
  confidence: number;
  adx: number;
}

export interface StrategyStat {
  strategy: StrategyName;
  trades: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  pnl: number;
  enabled: boolean;
}

export interface ScreenerDto {
  timestamp: number;
  watchlistSize: number;
  activeScanList: MomentumScore[];
  regimePerCoin: Record<string, MarketRegime>;
}

export interface AgentConfigDto {
  leverage: number;
  riskPct: number;
  maxDailyLossPct: number;
  maxConcurrentPositions: number;
  minRiskReward: number;
  symbols: string[];
  strategiesEnabled: Record<StrategyName, boolean>;
}

export type AgentControlAction = "start" | "pause" | "stop" | "close_all";

export interface TradesResponse {
  trades: Trade[];
  summary: {
    total: number;
    winRate: number;
    profitFactor: number;
    avgR: number;
    totalPnl: number;
  };
}
