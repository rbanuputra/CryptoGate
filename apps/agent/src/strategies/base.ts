import type {
  Candle,
  RegimeResult,
  Signal,
  StrategyName,
  Timeframe,
} from "@cryptogate/shared";
import type { OrderFlowSnapshot } from "../data/orderflow.js";

export interface ScanContext {
  symbol: string;
  chart: Candle[];
  htf: Candle[];
  htfTf: Timeframe;
  regime: RegimeResult;
  /** signal lifetime in ms */
  signalTtlMs: number;
  /** order-flow snapshot (OI/funding/LS ratio); present only when polled */
  orderflow?: OrderFlowSnapshot;
}

export interface Strategy {
  readonly name: StrategyName;
  /** Scan the latest closed bar; return any signals it generated. */
  scan(ctx: ScanContext): Signal[];
}

let counter = 0;
export function signalId(strategy: StrategyName, symbol: string, ts: number): string {
  counter = (counter + 1) % 1_000_000;
  return `${strategy}:${symbol}:${ts}:${counter}`;
}
