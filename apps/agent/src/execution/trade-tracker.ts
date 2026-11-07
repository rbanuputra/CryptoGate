/**
 * Ties order fills to the full position lifecycle: realize PnL, update equity +
 * drawdown, move SL to breakeven on TP1, record the closed Trade to the journal,
 * notify, and feed the risk circuit breaker.
 */
import type { Trade } from "@cryptogate/shared";
import type { ExchangeClient } from "../exchange/adapter.js";
import { PositionManager } from "./position-manager.js";
import type { OrderFillEvent } from "./user-stream.js";
import type { RiskManager } from "../risk/manager.js";
import type { Journal } from "../monitoring/journal.js";
import { templates, type Notifier } from "../monitoring/telegram.js";

export class TradeTracker {
  equity: number;
  peakEquity: number;

  constructor(
    startEquity: number,
    private readonly pm: PositionManager,
    private readonly client: ExchangeClient,
    private readonly risk: RiskManager,
    private readonly journal: Journal,
    private readonly notifier: Notifier,
  ) {
    this.equity = startEquity;
    this.peakEquity = startEquity;
  }

  snapshot() {
    return { equity: this.equity, peakEquity: this.peakEquity, openPositions: this.pm.list().filter((p) => p.status === "open").length };
  }

  async processFill(ev: OrderFillEvent): Promise<void> {
    if (ev.status !== "FILLED") return;
    const pos = this.pm.get(ev.symbol);
    if (!pos || pos.status !== "open") return;

    // TP1 leg: realize 50%, move SL to breakeven
    if (ev.orderId === pos.tp1OrderId && !pos.tp1Hit) {
      const before = this.equity;
      pos.realizedPnl += ev.realizedPnl;
      this.equity += ev.realizedPnl;
      await this.pm.onTP1Hit(this.client, ev.symbol);
      const pct = before > 0 ? (ev.realizedPnl / before) * 100 : 0;
      await this.notifier.send(templates.tp1(ev.symbol, pct));
      await this.recordEquity(ev.timestamp);
      return;
    }

    // Final leg: TP2, or SL / SL_BE
    const isTp2 = ev.orderId === pos.tp2OrderId;
    const isSl = ev.orderId === pos.slOrderId;
    if (!isTp2 && !isSl) return;

    pos.realizedPnl += ev.realizedPnl;
    this.equity += ev.realizedPnl;
    this.peakEquity = Math.max(this.peakEquity, this.equity);
    const exitType: Trade["exitType"] = isTp2 ? "TP2" : pos.tp1Hit ? "SL_BE" : "SL";

    this.risk.onClose(pos.realizedPnl);

    const trade: Trade = {
      id: `${pos.symbol}-${pos.openedAt}`,
      symbol: pos.symbol,
      strategy: pos.signal.strategy,
      regime: pos.signal.regime,
      direction: pos.direction,
      entryTime: pos.openedAt,
      exitTime: ev.timestamp,
      entryPrice: pos.signal.entryPrice,
      exitPrice: ev.avgPrice,
      slPrice: pos.signal.stopLoss,
      tp1Price: pos.signal.takeProfit1,
      tp2Price: pos.signal.takeProfit2,
      quantity: pos.size.quantity,
      notional: pos.size.notional,
      pnlUsdt: Number(pos.realizedPnl.toFixed(4)),
      pnlPct: pos.size.notional > 0 ? Number(((pos.realizedPnl / pos.size.notional) * 100).toFixed(4)) : 0,
      rMultiple: pos.size.riskAmount > 0 ? Number((pos.realizedPnl / pos.size.riskAmount).toFixed(4)) : 0,
      exitType,
      confidence: pos.signal.confidence,
      multiStrategyConfirm: Boolean(pos.signal.meta?.["multiConfirm"]),
      reasoning: pos.signal.reasoning,
      equityAfter: Number(this.equity.toFixed(2)),
    };
    await this.journal.recordTrade(trade);
    await this.notifier.send(templates.closed(trade));
    await this.recordEquity(ev.timestamp);

    pos.status = "closed";
    this.pm.remove(ev.symbol);
  }

  private async recordEquity(timestamp: number): Promise<void> {
    const dd = this.peakEquity > 0 ? ((this.peakEquity - this.equity) / this.peakEquity) * 100 : 0;
    await this.journal.recordEquity({
      timestamp,
      equity: Number(this.equity.toFixed(2)),
      openPnl: 0,
      drawdownPct: Number(dd.toFixed(3)),
      positionCount: this.pm.list().filter((p) => p.status === "open").length,
    });
  }
}
