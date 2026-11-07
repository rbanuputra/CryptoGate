import type { MarketRegime } from "./regime.js";
import type { StrategyName } from "./strategy.js";

export interface MomentumScore {
  symbol: string;
  /** 0-1 composite */
  score: number;
  priceChange4h: number;
  volumeSpike: number;
  atrExpansion: number;
  oiChange4h: number;
  regimeClarity: number;
}

export interface ScreenerUpdate {
  timestamp: number;
  watchlistSize: number;
  activeScanList: MomentumScore[];
  regimePerCoin: Record<string, MarketRegime>;
  activeStrategiesPerCoin: Record<string, StrategyName[]>;
}

export interface UniverseFilterConfig {
  minVolume24h: number;
  minOpenInterest: number;
  maxSpreadPct: number;
  minListingAgeDays: number;
  excludePatterns: string[];
}
