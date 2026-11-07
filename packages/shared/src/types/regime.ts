export enum MarketRegime {
  TRENDING_UP = "trending_up",
  TRENDING_DOWN = "trending_down",
  RANGING = "ranging",
  HIGH_VOLATILITY = "high_vol",
  LOW_VOLATILITY = "low_vol",
}

export interface RegimeResult {
  regime: MarketRegime;
  /** 0-1, how clearly indicators agree */
  confidence: number;
  trendDirection: 1 | -1 | 0;
  /** atrRatio = atr14 / atrSMA100 */
  volatilityLevel: number;
  adx: number;
  timestamp: number;
}
