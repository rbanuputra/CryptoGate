/**
 * Unified exchange adapter interface. Each exchange (Binance, Bitget, etc.)
 * implements this to provide trading, market data, order flow, and user stream.
 */
import type { Candle, ExchangeName, Timeframe } from "@cryptogate/shared";
import type { OrderFillEvent, AccountUpdateEvent, UserDataEvent } from "../execution/user-stream.js";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";

export interface OrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity?: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  closePosition?: boolean;
  timeInForce?: "GTC" | "IOC" | "FOK";
  workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: "NEW" | "FILLED" | "CANCELED";
  quantity: number;
}

export interface ExchangeClient {
  setLeverage(symbol: string, leverage: number): Promise<void>;
  setMarginType(symbol: string, type: "CROSS" | "ISOLATED"): Promise<void>;
  createOrder(params: OrderParams): Promise<OrderResult>;
  cancelOrder(symbol: string, orderId: string): Promise<void>;
}

export interface MarketDataAdapter {
  fetchKlines(symbol: string, interval: Timeframe, opts?: { startMs?: number; endMs?: number; limit?: number }): Promise<Candle[]>;
  klineWsUrl(symbols: string[], timeframes: Timeframe[]): string;
  parseKlineWsMessage(raw: string): { symbol: string; tf: Timeframe; candle: Candle; isClosed: boolean } | null;
}

export interface OrderFlowAdapter {
  fetchOpenInterest(symbol: string): Promise<number>;
  fetchFundingRate(symbol: string): Promise<number>;
  fetchLongShortRatio(symbol: string): Promise<number>;
}

export interface UserStreamAdapter {
  connect(apiKey: string): Promise<void>;
  onEvent(fn: (e: UserDataEvent) => void): void;
  close(): void;
}

export interface ExchangeAdapter {
  readonly name: ExchangeName;
  readonly client: ExchangeClient;
  readonly marketData: MarketDataAdapter;
  readonly orderFlow: OrderFlowAdapter;
  readonly userStream: UserStreamAdapter;
}
