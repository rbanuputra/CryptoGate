/**
 * Offline backtest harness for the SMC Sweep strategy — reuses the exact
 * signal detection used live. Realistic execution: next-bar-open fills,
 * slippage + taker fees, TP1 (50% + move SL to breakeven) -> TP2, SL / SL_BE.
 */
import type { Candle, Timeframe } from "@cryptogate/shared";
import { detectSmcSignals, SMC_DEFAULT, type SmcConfig } from "../strategies/smc-sweep.js";

export interface BacktestConfig {
  startEquity: number;
  riskPct: number;
  slippagePct: number;
  takerFeePct: number;
  smc: SmcConfig;
}

export const BACKTEST_DEFAULT: BacktestConfig = {
  startEquity: 10_000,
  riskPct: 0.02,
  slippagePct: 0.0002,
  takerFeePct: 0.0006,
  smc: SMC_DEFAULT,
};

export interface BtTrade {
  id: number;
  direction: "long" | "short";
  entryType: "OB" | "FVG";
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  exitPrice: number;
  exitType: "TP1" | "TP2" | "SL" | "SL_BE" | "EOD";
  pnl: number;
  rMultiple: number;
  equityAfter: number;
}

export interface BacktestResult {
  trades: BtTrade[];
  finalEquity: number;
  startEquity: number;
  stats: BacktestStats;
}

export interface BacktestStats {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  avgR: number;
}

export function backtestSmc(
  chart: Candle[],
  htf: Candle[],
  htfTf: Timeframe,
  cfg: BacktestConfig = BACKTEST_DEFAULT,
): BacktestResult {
  const signals = detectSmcSignals(chart, htf, htfTf, cfg.smc);
  const byBar = new Map<number, (typeof signals)[number]>();
  for (const s of signals) if (!byBar.has(s.barIndex)) byBar.set(s.barIndex, s);

  let equity = cfg.startEquity;
  let peak = equity;
  let maxDd = 0;
  const trades: BtTrade[] = [];

  let i = 0;
  const n = chart.length;
  while (i < n - 1) {
    const sig = byBar.get(i);
    if (!sig) {
      i++;
      continue;
    }
    // enter at next bar open
    const entryBar = i + 1;
    const open = chart[entryBar]!.open;
    const slip = cfg.slippagePct;
    const entry = sig.direction === "long" ? open * (1 + slip) : open * (1 - slip);
    const risk = Math.abs(entry - sig.slPrice);
    if (risk <= 0) {
      i++;
      continue;
    }
    const units = (equity * cfg.riskPct) / risk;
    const entryFee = entry * units * cfg.takerFeePct;
    const tp1 = sig.direction === "long" ? entry + cfg.smc.tp1Rr * risk : entry - cfg.smc.tp1Rr * risk;
    const tp2 = sig.direction === "long" ? entry + cfg.smc.tp2Rr * risk : entry - cfg.smc.tp2Rr * risk;

    let sl = sig.slPrice;
    let remaining = 1.0;
    let tp1Hit = false;
    let realized = 0;
    let exitType: BtTrade["exitType"] = "EOD";
    let exitPrice = chart[n - 1]!.close;
    let exitTime = chart[n - 1]!.openTime;

    for (let j = entryBar; j < n; j++) {
      const bar = chart[j]!;
      const long = sig.direction === "long";
      const legPnl = (px: number, frac: number) => {
        const u = units * frac;
        const gross = long ? (px - entry) * u : (entry - px) * u;
        return gross - px * u * cfg.takerFeePct - entryFee * frac;
      };
      if (!tp1Hit) {
        const hitSl = long ? bar.low <= sl : bar.high >= sl;
        const hitTp1 = long ? bar.high >= tp1 : bar.low <= tp1;
        if (hitSl) {
          const px = long ? sl * (1 - slip) : sl * (1 + slip);
          realized += legPnl(px, remaining);
          exitType = "SL";
          exitPrice = px;
          exitTime = bar.openTime;
          break;
        }
        if (hitTp1) {
          const px = long ? tp1 * (1 - slip) : tp1 * (1 + slip);
          realized += legPnl(px, 0.5);
          remaining = 0.5;
          tp1Hit = true;
          sl = entry; // breakeven
          const hitTp2Same = long ? bar.high >= tp2 : bar.low <= tp2;
          if (hitTp2Same) {
            const px2 = long ? tp2 * (1 - slip) : tp2 * (1 + slip);
            realized += legPnl(px2, 0.5);
            exitType = "TP2";
            exitPrice = px2;
            exitTime = bar.openTime;
            break;
          }
        }
      } else {
        const hitBe = long ? bar.low <= sl : bar.high >= sl;
        const hitTp2 = long ? bar.high >= tp2 : bar.low <= tp2;
        if (hitBe) {
          const px = long ? sl * (1 - slip) : sl * (1 + slip);
          realized += legPnl(px, remaining);
          exitType = "SL_BE";
          exitPrice = px;
          exitTime = bar.openTime;
          break;
        }
        if (hitTp2) {
          const px = long ? tp2 * (1 - slip) : tp2 * (1 + slip);
          realized += legPnl(px, remaining);
          exitType = "TP2";
          exitPrice = px;
          exitTime = bar.openTime;
          break;
        }
      }
      if (j === n - 1) {
        const px = long ? bar.close * (1 - slip) : bar.close * (1 + slip);
        realized += legPnl(px, remaining);
        exitType = tp1Hit ? "TP1" : "EOD";
        exitPrice = px;
        exitTime = bar.openTime;
      }
    }

    equity += realized;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
    trades.push({
      id: trades.length + 1,
      direction: sig.direction,
      entryType: sig.zoneKind,
      entryTime: chart[entryBar]!.openTime,
      exitTime,
      entryPrice: entry,
      slPrice: sig.slPrice,
      tp1Price: tp1,
      tp2Price: tp2,
      exitPrice,
      exitType,
      pnl: Number(realized.toFixed(4)),
      rMultiple: Number((realized / (equity > 0 ? cfg.startEquity * cfg.riskPct : 1)).toFixed(4)),
      equityAfter: Number(equity.toFixed(2)),
    });

    // advance past this trade's exit bar to respect "1 position at a time"
    const exitBarIdx = chart.findIndex((c) => c.openTime === exitTime);
    i = exitBarIdx > i ? exitBarIdx + 1 : entryBar + 1;
  }

  return {
    trades,
    finalEquity: equity,
    startEquity: cfg.startEquity,
    stats: computeStats(trades, equity, cfg.startEquity, maxDd),
  };
}

function computeStats(trades: BtTrade[], finalEquity: number, startEquity: number, maxDd: number): BacktestStats {
  const wins = trades.filter((t) => t.pnl > 0);
  const grossP = wins.reduce((s, t) => s + t.pnl, 0);
  const grossL = -trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  const pf = grossL > 0 ? grossP / grossL : grossP > 0 ? 999 : 0;
  const avgR = trades.length ? trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length : 0;
  return {
    totalTrades: trades.length,
    winRate: trades.length ? Number((wins.length / trades.length).toFixed(4)) : 0,
    profitFactor: Number(pf.toFixed(3)),
    totalReturnPct: Number(((finalEquity / startEquity - 1) * 100).toFixed(2)),
    maxDrawdownPct: Number((maxDd * 100).toFixed(2)),
    avgR: Number(avgR.toFixed(4)),
  };
}
