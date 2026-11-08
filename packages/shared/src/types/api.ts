import type { Direction, Signal, StrategyName } from "./strategy.js";
import type { Trade } from "./trade.js";
import type { MarketRegime } from "./regime.js";
import type { MomentumScore } from "./screener.js";

export type ExchangeName = "binance" | "bitget";

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
  exchange: ExchangeName;
  leverage: number;
  riskPct: number;
  maxDailyLossPct: number;
  maxConcurrentPositions: number;
  minRiskReward: number;
  /** SL distance floor in ATRs (adaptive to volatility). 0 = off. */
  minStopAtr: number;
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

export interface BacktestRequestDto {
  symbol: string;
  chartTf: string;
  htfTf: string;
  startEquity: number;
  riskPct: number;
  slippagePct: number;
  takerFeePct: number;
  /** SL distance floor in ATRs. 0 = off, omitted = agent default. */
  minStopAtr?: number;
  strategies?: string[] | "all";
  useRegimeSwitching?: boolean;
  walkForward?: boolean;
  days?: number;
}

export interface BacktestTradeDto {
  id: number;
  direction: "long" | "short";
  entryType: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  exitType: string;
  pnl: number;
  rMultiple: number;
  equityAfter: number;
}

export interface BacktestStatsDto {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  avgR: number;
  sharpeRatio?: number;
}

export interface BacktestResultDto {
  symbol: string;
  chartTf: string;
  htfTf: string;
  trades: BacktestTradeDto[];
  equityCurve: Array<{ time: number; equity: number }>;
  stats: BacktestStatsDto;
  startEquity: number;
  finalEquity: number;
  strategyBreakdown?: Record<string, { trades: number; winRate: number; pf: number; pnl: number }>;
  regimeLog?: Array<{ time: number; regime: string }>;
  /** requested strategies the backtest could not run (need historical order-flow data) */
  skippedStrategies?: string[];
  walkForward?: { train: BacktestStatsDto; test: BacktestStatsDto };
  period?: { from: number; to: number; bars: number };
}
