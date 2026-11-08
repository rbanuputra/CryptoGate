/**
 * Module 6: Signal Aggregator.
 * Runs active strategies for a symbol, scores + filters + dedupes their signals,
 * and returns them ranked. The Risk Manager (next increment) consumes the top.
 */
import {
  atr,
  type Candle,
  type RegimeResult,
  type Signal,
  type StrategyConfigEntry,
  type StrategyName,
  type Timeframe,
} from "@cryptogate/shared";
import type { Strategy } from "../strategies/base.js";
import { lastReal } from "../strategies/util.js";
import { applyStopFloor, STOP_POLICY_DEFAULT, type StopPolicy } from "./stop-policy.js";
import type { OrderFlowSnapshot } from "../data/orderflow.js";
import { getActiveStrategies, scoreSignal, type ScoreContext } from "./selector.js";

export interface ScoredSignal {
  signal: Signal;
  score: number;
}

export interface SignalHistoryEntry {
  symbol: string;
  direction: Signal["direction"];
  strategy: StrategyName;
  timestamp: number;
}

const MULTI_CONFIRM_WINDOW_MS = 45 * 60 * 1000;
const MIN_SCORE = 0.3;
const MIN_RR = 2.0;

export interface AggregatorInput {
  symbol: string;
  chart: Candle[];
  htf: Candle[];
  htfTf: Timeframe;
  regime: RegimeResult;
  signalTtlMs: number;
  registry: Map<StrategyName, Strategy>;
  history: SignalHistoryEntry[];
  orderflow?: OrderFlowSnapshot;
  /** optional contextual flags (default false) */
  isKeyLevel?: (price: number) => boolean;
  hasCorrelatedPosition?: (symbol: string, dir: Signal["direction"]) => boolean;
  dailyLossApproaching?: boolean;
  /** ATR-based SL floor applied to every signal before scoring. `null` disables it. */
  stopPolicy?: StopPolicy | null;
  /**
   * false = ignore the regime->strategy map: every registered strategy runs with
   * weight 1.0 and no direction policy. Default true (regime-gated).
   */
  regimeSwitching?: boolean;
}

export function multiStrategyConfirm(
  signal: Signal,
  history: SignalHistoryEntry[],
  now: number,
): boolean {
  return history.some(
    (h) =>
      h.symbol === signal.symbol &&
      h.direction === signal.direction &&
      h.strategy !== signal.strategy &&
      now - h.timestamp < MULTI_CONFIRM_WINDOW_MS,
  );
}

export function aggregate(input: AggregatorInput): ScoredSignal[] {
  const switching = input.regimeSwitching !== false;
  const active: StrategyConfigEntry[] = switching
    ? getActiveStrategies(input.regime.regime)
    : [...input.registry.keys()].map((strategy) => ({ strategy, weight: 1.0, direction: "both" as const }));
  const now = input.chart[input.chart.length - 1]?.openTime ?? Date.now();

  // 1-2. run each active strategy that is registered
  const raw: Signal[] = [];
  for (const entry of active) {
    const strat = input.registry.get(entry.strategy);
    if (!strat) continue; // not implemented yet
    const signals = strat.scan({
      symbol: input.symbol,
      chart: input.chart,
      htf: input.htf,
      htfTf: input.htfTf,
      regime: input.regime,
      signalTtlMs: input.signalTtlMs,
      orderflow: input.orderflow,
    });
    raw.push(...signals);
  }

  // 2b. widen stops that are too tight for current volatility (keeps R multiples)
  const policy = input.stopPolicy === undefined ? STOP_POLICY_DEFAULT : input.stopPolicy;
  if (policy && raw.length > 0) {
    const atrNow = lastReal(atr(input.chart, 14));
    for (let i = 0; i < raw.length; i++) raw[i] = applyStopFloor(raw[i]!, atrNow, policy);
  }

  // 3. score
  const scored: ScoredSignal[] = raw.map((signal) => {
    const ctx: ScoreContext = {
      multiStrategyConfirm: multiStrategyConfirm(signal, input.history, now),
      isKeyLevel: input.isKeyLevel?.(signal.entryPrice) ?? false,
      hasCorrelatedPosition: input.hasCorrelatedPosition?.(signal.symbol, signal.direction) ?? false,
      dailyLossApproaching: input.dailyLossApproaching ?? false,
    };
    const entry = switching ? undefined : active.find((a) => a.strategy === signal.strategy);
    return { signal, score: scoreSignal(signal, input.regime, ctx, entry) };
  });

  // 4. filter
  const filtered = scored.filter((s) => s.score > MIN_SCORE && s.signal.riskReward >= MIN_RR);

  // 5. dedupe (same symbol+direction) keeping highest score
  const best = new Map<string, ScoredSignal>();
  for (const s of filtered) {
    const key = `${s.signal.symbol}:${s.signal.direction}`;
    const cur = best.get(key);
    if (!cur || s.score > cur.score) best.set(key, s);
  }

  // 6. rank
  return [...best.values()].sort((a, b) => b.score - a.score);
}
