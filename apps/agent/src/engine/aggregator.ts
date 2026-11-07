/**
 * Module 6: Signal Aggregator.
 * Runs active strategies for a symbol, scores + filters + dedupes their signals,
 * and returns them ranked. The Risk Manager (next increment) consumes the top.
 */
import type { Candle, RegimeResult, Signal, StrategyName, Timeframe } from "@cryptogate/shared";
import type { Strategy } from "../strategies/base.js";
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
  /** optional contextual flags (default false) */
  isKeyLevel?: (price: number) => boolean;
  hasCorrelatedPosition?: (symbol: string, dir: Signal["direction"]) => boolean;
  dailyLossApproaching?: boolean;
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
  const active = getActiveStrategies(input.regime.regime);
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
    });
    raw.push(...signals);
  }

  // 3. score
  const scored: ScoredSignal[] = raw.map((signal) => {
    const ctx: ScoreContext = {
      multiStrategyConfirm: multiStrategyConfirm(signal, input.history, now),
      isKeyLevel: input.isKeyLevel?.(signal.entryPrice) ?? false,
      hasCorrelatedPosition: input.hasCorrelatedPosition?.(signal.symbol, signal.direction) ?? false,
      dailyLossApproaching: input.dailyLossApproaching ?? false,
    };
    return { signal, score: scoreSignal(signal, input.regime, ctx) };
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
