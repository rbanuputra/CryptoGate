/**
 * Strategy 4: OI + Funding Divergence (Tier-1 coins).
 * Price makes a new local extreme while Open Interest declines (positions being
 * liquidated = exhaustion), confirmed by a funding-rate or long/short extreme.
 * Reversal trade with wider stops.
 */
import { atr, type Signal } from "@cryptogate/shared";
import type { ScanContext, Strategy } from "./base.js";
import { buildSignal, lastReal } from "./util.js";

export interface OiDivergenceConfig {
  oiLookbackBars: number;
  oiDivergenceMinPct: number;
  fundingExtremeNegative: number; // percent
  fundingExtremePositive: number; // percent
  lsRatioExtremeHigh: number;
  lsRatioExtremeLow: number;
  slAtrMult: number;
  tp1Rr: number;
  tp2Rr: number;
}

export const OI_DIVERGENCE_DEFAULT: OiDivergenceConfig = {
  oiLookbackBars: 20,
  oiDivergenceMinPct: 3.0,
  fundingExtremeNegative: -0.01,
  fundingExtremePositive: 0.05,
  lsRatioExtremeHigh: 2.5,
  lsRatioExtremeLow: 0.4,
  slAtrMult: 1.5,
  tp1Rr: 2.0,
  tp2Rr: 3.5,
};

export class OiDivergenceStrategy implements Strategy {
  readonly name = "oi_divergence" as const;
  constructor(private readonly cfg: OiDivergenceConfig = OI_DIVERGENCE_DEFAULT) {}

  scan(ctx: ScanContext): Signal[] {
    const of = ctx.orderflow;
    const cfg = this.cfg;
    const n = ctx.chart.length;
    if (!of || of.oi.length < 3 || n < cfg.oiLookbackBars + 2) return [];
    const L = n - 1;
    const cur = ctx.chart[L]!;
    const a = lastReal(atr(ctx.chart, 14));
    if (!(a > 0)) return [];

    // OI decline over the window (percent)
    const oiNow = of.oi[of.oi.length - 1]!;
    const lookIdx = Math.max(0, of.oi.length - 1 - cfg.oiLookbackBars);
    const oiThen = of.oi[lookIdx]!;
    const oiDeclinePct = oiThen > 0 ? ((oiThen - oiNow) / oiThen) * 100 : 0;
    const oiDeclining = oiDeclinePct >= cfg.oiDivergenceMinPct;
    if (!oiDeclining) return [];

    const prevWindow = ctx.chart.slice(L - cfg.oiLookbackBars, L);
    const windowLow = Math.min(...prevWindow.map((c) => c.low));
    const windowHigh = Math.max(...prevWindow.map((c) => c.high));

    // BULLISH: new local low + OI falling + crowd-short confirmation
    const newLow = cur.low <= windowLow;
    const bullConfirm = of.fundingRate < cfg.fundingExtremeNegative || of.lsRatio < cfg.lsRatioExtremeLow;
    if (newLow && bullConfirm) {
      const sl = cur.low - a * cfg.slAtrMult;
      const sig = buildSignal({
        strategy: "oi_divergence", symbol: ctx.symbol, direction: "long",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
        confidence: 0.75, regime: ctx.regime.regime,
        reasoning: `OI -${oiDeclinePct.toFixed(1)}% at new low, funding ${of.fundingRate.toFixed(3)}% LS ${of.lsRatio.toFixed(2)}`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs,
        meta: { oiDeclinePct, fundingRate: of.fundingRate, lsRatio: of.lsRatio },
      });
      return sig ? [sig] : [];
    }

    // BEARISH: new local high + OI falling + crowd-long confirmation
    const newHigh = cur.high >= windowHigh;
    const bearConfirm = of.fundingRate > cfg.fundingExtremePositive || of.lsRatio > cfg.lsRatioExtremeHigh;
    if (newHigh && bearConfirm) {
      const sl = cur.high + a * cfg.slAtrMult;
      const sig = buildSignal({
        strategy: "oi_divergence", symbol: ctx.symbol, direction: "short",
        entryPrice: cur.close, stopLoss: sl, tp1Rr: cfg.tp1Rr, tp2Rr: cfg.tp2Rr,
        confidence: 0.75, regime: ctx.regime.regime,
        reasoning: `OI -${oiDeclinePct.toFixed(1)}% at new high, funding ${of.fundingRate.toFixed(3)}% LS ${of.lsRatio.toFixed(2)}`,
        timestamp: cur.openTime, signalTtlMs: ctx.signalTtlMs,
        meta: { oiDeclinePct, fundingRate: of.fundingRate, lsRatio: of.lsRatio },
      });
      return sig ? [sig] : [];
    }
    return [];
  }
}
