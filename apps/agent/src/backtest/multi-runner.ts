/**
 * Phase 8: Multi-strategy backtest runner.
 * Reuses the live strategy engines, regime detector, and aggregator to simulate
 * the full agent loop offline. Supports single-strategy or regime-switched mode.
 */
import type { Candle, Timeframe, StrategyName, Signal } from "@cryptogate/shared";
import { TF_MS, computeIndicators } from "@cryptogate/shared";
import { detectRegime } from "../regime/detector.js";
import { aggregate, type SignalHistoryEntry } from "../engine/aggregator.js";
import { SmcSweepStrategy, PrecomputedSmcStrategy } from "../strategies/smc-strategy.js";
import { MomentumBreakoutStrategy } from "../strategies/momentum-breakout.js";
import { MeanReversionStrategy } from "../strategies/mean-reversion.js";
import { VwapBounceStrategy } from "../strategies/vwap-bounce.js";
import { OiDivergenceStrategy } from "../strategies/oi-divergence.js";
import { LiquidationFadeStrategy } from "../strategies/liquidation-fade.js";
import type { Strategy } from "../strategies/base.js";
import { STOP_POLICY_DEFAULT } from "../engine/stop-policy.js";

export interface MultiBacktestConfig {
  startEquity: number;
  riskPct: number;
  slippagePct: number;
  takerFeePct: number;
  /** ATR-based SL floor (0 = off) */
  minStopAtr: number;
  /** TP1/TP2 as resting limit orders: maker fee, no slippage, must trade through the price */
  tpMaker: boolean;
  makerFeePct: number;
  /** how far price must trade beyond a limit TP for it to count as filled */
  makerFillBufferPct: number;
  strategies: StrategyName[] | "all";
  useRegimeSwitching: boolean;
  htfTf: Timeframe;
}

export const MULTI_BT_DEFAULT: MultiBacktestConfig = {
  startEquity: 10_000,
  riskPct: 0.02,
  slippagePct: 0.0002,
  takerFeePct: 0.0006,
  minStopAtr: STOP_POLICY_DEFAULT.minStopAtr,
  tpMaker: false,
  makerFeePct: 0.0002,
  makerFillBufferPct: 0.0001,
  strategies: "all",
  useRegimeSwitching: true,
  htfTf: "4h",
};

export interface MbtTrade {
  id: number;
  strategy: StrategyName;
  direction: "long" | "short";
  regime: string;
  entryBar: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  exitType: "TP1" | "TP2" | "SL" | "SL_BE" | "EOD";
  pnl: number;
  rMultiple: number;
  equityAfter: number;
}

export interface MultiBacktestResult {
  trades: MbtTrade[];
  equityCurve: Array<{ time: number; equity: number }>;
  stats: MultiBacktestStats;
  startEquity: number;
  finalEquity: number;
  regimeLog: Array<{ time: number; regime: string }>;
  strategyBreakdown: Record<string, { trades: number; winRate: number; pf: number; pnl: number }>;
  /** requested strategies that could not run (need order-flow data) */
  skippedStrategies: StrategyName[];
}

export interface MultiBacktestStats {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  avgR: number;
  sharpeRatio: number;
}

/**
 * Strategies that need historical order-flow (OI / funding / long-short ratio).
 * The backtest has no such series, so they would silently never fire — they are
 * excluded and reported in `skippedStrategies` instead.
 */
export const ORDERFLOW_STRATEGIES: StrategyName[] = ["oi_divergence", "liquidation_fade"];

function buildRegistry(strategies: StrategyName[] | "all"): Map<StrategyName, Strategy> {
  const all: [StrategyName, Strategy][] = [
    ["smc_sweep", new SmcSweepStrategy()],
    ["momentum_breakout", new MomentumBreakoutStrategy()],
    ["mean_reversion", new MeanReversionStrategy()],
    ["vwap_bounce", new VwapBounceStrategy()],
    ["oi_divergence", new OiDivergenceStrategy()],
    ["liquidation_fade", new LiquidationFadeStrategy()],
  ];
  const runnable = all.filter(([name]) => !ORDERFLOW_STRATEGIES.includes(name));
  if (strategies === "all") return new Map(runnable);
  return new Map(runnable.filter(([name]) => strategies.includes(name)));
}

function skippedFor(strategies: StrategyName[] | "all"): StrategyName[] {
  return ORDERFLOW_STRATEGIES.filter((s) => strategies === "all" || strategies.includes(s));
}

export function backtestMulti(
  chart: Candle[],
  htf: Candle[],
  cfg: MultiBacktestConfig = MULTI_BT_DEFAULT,
): MultiBacktestResult {
  const registry = buildRegistry(cfg.strategies);
  const skippedStrategies = skippedFor(cfg.strategies);
  const n = chart.length;
  if (n < 100) return emptyResult(cfg.startEquity, skippedStrategies);

  // SMC needs its full state history; a rolling 200-bar window fabricates signals (see class doc).
  let smcPre: PrecomputedSmcStrategy | null = null;
  if (registry.has("smc_sweep")) {
    smcPre = new PrecomputedSmcStrategy(chart, htf, cfg.htfTf);
    registry.set("smc_sweep", smcPre);
  }

  let equity = cfg.startEquity;
  let peak = equity;
  let maxDd = 0;
  const trades: MbtTrade[] = [];
  const equityCurve: Array<{ time: number; equity: number }> = [{ time: chart[0]!.openTime, equity }];
  const regimeLog: Array<{ time: number; regime: string }> = [];
  const history: SignalHistoryEntry[] = [];

  const chartStep = chart[1]!.openTime - chart[0]!.openTime;
  const htfStep = TF_MS[cfg.htfTf];
  let htfEnd = 0;
  const LOOKBACK = 200;
  const SIGNAL_TTL = 30 * 60 * 1000;
  let inPosition = false;
  let cooldownUntil = 0;

  for (let i = LOOKBACK; i < n - 1; i++) {
    if (inPosition) continue;
    if (i < cooldownUntil) continue;

    const chartSlice = chart.slice(Math.max(0, i - LOOKBACK), i + 1);
    const barTime = chart[i]!.openTime;

    // only HTF candles fully closed by the end of this chart bar (no lookahead)
    while (htfEnd < htf.length && htf[htfEnd]!.openTime + htfStep <= barTime + chartStep) htfEnd++;
    if (htfEnd < 50) continue;
    const htfWindow = htf.slice(Math.max(0, htfEnd - 200), htfEnd);

    const regime = detectRegime(htfWindow, chartSlice);
    regimeLog.push({ time: barTime, regime: regime.regime });
    if (smcPre) smcPre.cursor = i;

    const ranked = aggregate({
      symbol: "BACKTEST",
      chart: chartSlice,
      htf: htfWindow,
      htfTf: cfg.htfTf,
      regime,
      signalTtlMs: SIGNAL_TTL,
      registry,
      regimeSwitching: cfg.useRegimeSwitching,
      history,
      stopPolicy: cfg.minStopAtr > 0 ? { minStopAtr: cfg.minStopAtr } : null,
    });

    const top = ranked[0];
    if (!top) continue;

    const sig = top.signal;
    history.push({ symbol: sig.symbol, direction: sig.direction, strategy: sig.strategy, timestamp: sig.timestamp });

    // simulate trade execution
    const trade = simulateTrade(sig, chart, i, equity, cfg, trades.length + 1);
    if (!trade) continue;

    inPosition = true;
    equity = trade.equityAfter;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
    trades.push(trade);
    equityCurve.push({ time: trade.exitTime, equity: trade.equityAfter });

    // advance past exit
    const exitIdx = chart.findIndex((c) => c.openTime >= trade.exitTime);
    if (exitIdx > i) {
      cooldownUntil = exitIdx + 3;
    }
    inPosition = false;
  }

  return {
    trades,
    equityCurve,
    stats: computeStats(trades, equity, cfg.startEquity, maxDd, equityCurve, chart[0]!.openTime, chart[n - 1]!.openTime),
    startEquity: cfg.startEquity,
    finalEquity: equity,
    regimeLog,
    strategyBreakdown: computeBreakdown(trades),
    skippedStrategies,
  };
}

export function simulateTrade(
  sig: Signal,
  chart: Candle[],
  signalBar: number,
  equity: number,
  cfg: MultiBacktestConfig,
  tradeId: number,
): MbtTrade | null {
  const n = chart.length;
  const entryBar = signalBar + 1;
  if (entryBar >= n) return null;

  const open = chart[entryBar]!.open;
  const slip = cfg.slippagePct;
  const entry = sig.direction === "long" ? open * (1 + slip) : open * (1 - slip);
  const risk = Math.abs(entry - sig.stopLoss);
  if (risk <= 0) return null;

  const units = (equity * cfg.riskPct) / risk;
  const entryFee = entry * units * cfg.takerFeePct;
  const tp1 = sig.takeProfit1;
  const tp2 = sig.takeProfit2;
  let sl = sig.stopLoss;
  let tp1Hit = false;
  let remaining = 1.0;
  let realized = 0;
  let exitType: MbtTrade["exitType"] = "EOD";
  let exitPrice = chart[n - 1]!.close;
  let exitTime = chart[n - 1]!.openTime;

  // maker = resting limit order (TP legs when cfg.tpMaker): maker fee, no slippage
  const legPnl = (px: number, frac: number, maker = false) => {
    const u = units * frac;
    const gross = sig.direction === "long" ? (px - entry) * u : (entry - px) * u;
    const fee = maker ? cfg.makerFeePct : cfg.takerFeePct;
    return gross - px * u * fee - entryFee * frac;
  };
  const buf = cfg.makerFillBufferPct;

  for (let j = entryBar; j < n; j++) {
    const bar = chart[j]!;
    const long = sig.direction === "long";
    // A resting limit only fills if price trades THROUGH it (touching isn't enough);
    // a market-type TP triggers on touch and pays slippage.
    const tpReached = (p: number) =>
      cfg.tpMaker ? (long ? bar.high >= p * (1 + buf) : bar.low <= p * (1 - buf)) : (long ? bar.high >= p : bar.low <= p);
    const tpPx = (p: number) => (cfg.tpMaker ? p : long ? p * (1 - slip) : p * (1 + slip));

    if (!tp1Hit) {
      const hitSl = long ? bar.low <= sl : bar.high >= sl;
      const hitTp1 = tpReached(tp1);
      if (hitSl) {
        const px = long ? sl * (1 - slip) : sl * (1 + slip);
        realized += legPnl(px, remaining);
        exitType = "SL"; exitPrice = px; exitTime = bar.openTime;
        break;
      }
      if (hitTp1) {
        const px = tpPx(tp1);
        realized += legPnl(px, 0.5, cfg.tpMaker);
        remaining = 0.5; tp1Hit = true; sl = entry;
        if (tpReached(tp2)) {
          const px2 = tpPx(tp2);
          realized += legPnl(px2, 0.5, cfg.tpMaker);
          exitType = "TP2"; exitPrice = px2; exitTime = bar.openTime;
          break;
        }
      }
    } else {
      const hitBe = long ? bar.low <= sl : bar.high >= sl;
      const hitTp2 = tpReached(tp2);
      if (hitBe) {
        const px = long ? sl * (1 - slip) : sl * (1 + slip);
        realized += legPnl(px, remaining);
        exitType = "SL_BE"; exitPrice = px; exitTime = bar.openTime;
        break;
      }
      if (hitTp2) {
        const px = tpPx(tp2);
        realized += legPnl(px, remaining, cfg.tpMaker);
        exitType = "TP2"; exitPrice = px; exitTime = bar.openTime;
        break;
      }
    }
    if (j === n - 1) {
      const px = long ? bar.close * (1 - slip) : bar.close * (1 + slip);
      realized += legPnl(px, remaining);
      exitType = tp1Hit ? "TP1" : "EOD";
      exitPrice = px; exitTime = bar.openTime;
    }
  }

  const eqAfter = equity + realized;
  return {
    id: tradeId,
    strategy: sig.strategy,
    direction: sig.direction,
    regime: sig.regime,
    entryBar,
    entryTime: chart[entryBar]!.openTime,
    exitTime, entryPrice: entry, exitPrice, slPrice: sig.stopLoss,
    tp1Price: tp1, tp2Price: tp2, exitType,
    pnl: Number(realized.toFixed(4)),
    // R = PnL / the risk actually budgeted for THIS trade (equity at entry × riskPct)
    rMultiple: Number((realized / (equity * cfg.riskPct || 1)).toFixed(4)),
    equityAfter: Number(eqAfter.toFixed(2)),
  };
}

function computeStats(
  trades: MbtTrade[], finalEquity: number, startEquity: number, maxDd: number,
  curve: Array<{ time: number; equity: number }>,
  startTime: number,
  endTime: number,
): MultiBacktestStats {
  const wins = trades.filter((t) => t.pnl > 0);
  const grossP = wins.reduce((s, t) => s + t.pnl, 0);
  const grossL = -trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  const pf = grossL > 0 ? grossP / grossL : grossP > 0 ? 999 : 0;
  const avgR = trades.length ? trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length : 0;

  const sharpe = dailySharpe(curve, startTime, endTime);

  return {
    totalTrades: trades.length,
    winRate: trades.length ? Number((wins.length / trades.length).toFixed(4)) : 0,
    profitFactor: Number(pf.toFixed(3)),
    totalReturnPct: Number(((finalEquity / startEquity - 1) * 100).toFixed(2)),
    maxDrawdownPct: Number((maxDd * 100).toFixed(2)),
    avgR: Number(avgR.toFixed(4)),
    sharpeRatio: Number(sharpe.toFixed(3)),
  };
}

const DAY_MS = 86_400_000;

/** Annualized Sharpe from end-of-day equity (flat days count as 0% return). 0 if < 5 days or no variance. */
export function dailySharpe(curve: Array<{ time: number; equity: number }>, startTime: number, endTime: number): number {
  const firstDay = Math.floor(startTime / DAY_MS);
  const lastDay = Math.floor(endTime / DAY_MS);
  if (lastDay - firstDay < 5 || curve.length === 0) return 0;
  const returns: number[] = [];
  let prevEquity = curve[0]!.equity;
  let i = 0;
  for (let d = firstDay; d <= lastDay; d++) {
    let eq = prevEquity;
    while (i < curve.length && curve[i]!.time < (d + 1) * DAY_MS) eq = curve[i++]!.equity;
    if (prevEquity > 0) returns.push((eq - prevEquity) / prevEquity);
    prevEquity = eq;
  }
  const mean = returns.reduce((a, r) => a + r, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  return std > 1e-12 ? Number(((mean / std) * Math.sqrt(365)).toFixed(3)) : 0;
}

function computeBreakdown(trades: MbtTrade[]): Record<string, { trades: number; winRate: number; pf: number; pnl: number }> {
  const byStrat = new Map<string, MbtTrade[]>();
  for (const t of trades) {
    const arr = byStrat.get(t.strategy) ?? [];
    arr.push(t);
    byStrat.set(t.strategy, arr);
  }
  const out: Record<string, { trades: number; winRate: number; pf: number; pnl: number }> = {};
  for (const [name, ts] of byStrat) {
    const wins = ts.filter((t) => t.pnl > 0);
    const gp = wins.reduce((s, t) => s + t.pnl, 0);
    const gl = -ts.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
    out[name] = {
      trades: ts.length,
      winRate: Number((wins.length / ts.length).toFixed(4)),
      pf: Number((gl > 0 ? gp / gl : gp > 0 ? 999 : 0).toFixed(3)),
      pnl: Number(ts.reduce((s, t) => s + t.pnl, 0).toFixed(2)),
    };
  }
  return out;
}

/** Walk-forward split: train period then test period */
export function walkForwardSplit(
  chart: Candle[], htf: Candle[],
  trainRatio: number = 0.7,
  /** HTF candle duration in ms (default 4h) — used for the 200-bar warm-up overlap */
  htfStepMs: number = TF_MS["4h"],
): { train: { chart: Candle[]; htf: Candle[] }; test: { chart: Candle[]; htf: Candle[] } } {
  const splitIdx = Math.floor(chart.length * trainRatio);
  const splitTime = chart[splitIdx]?.openTime ?? 0;
  return {
    train: { chart: chart.slice(0, splitIdx), htf: htf.filter((c) => c.openTime < splitTime) },
    test: { chart: chart.slice(splitIdx), htf: htf.filter((c) => c.openTime >= splitTime - 200 * htfStepMs) },
  };
}

function emptyResult(startEquity: number, skippedStrategies: StrategyName[] = []): MultiBacktestResult {
  return {
    skippedStrategies,
    trades: [], equityCurve: [{ time: 0, equity: startEquity }],
    stats: { totalTrades: 0, winRate: 0, profitFactor: 0, totalReturnPct: 0, maxDrawdownPct: 0, avgR: 0, sharpeRatio: 0 },
    startEquity, finalEquity: startEquity, regimeLog: [],
    strategyBreakdown: {},
  };
}
