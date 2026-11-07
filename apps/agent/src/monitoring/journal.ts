/**
 * Module 9: Trade journal / persistence.
 * `Journal` is the port the agent writes to. `InMemoryJournal` backs tests and
 * paper mode; `PrismaJournal` persists to Postgres (inject a Prisma client so
 * this module has no build-time dependency on the generated client).
 */
import type { Signal, Trade, MarketRegime } from "@cryptogate/shared";

export interface EquityPoint {
  timestamp: number;
  equity: number;
  openPnl: number;
  drawdownPct: number;
  positionCount: number;
}

export interface RegimeRecord {
  timestamp: number;
  symbol: string;
  regime: MarketRegime;
  confidence: number;
  adx: number;
  atrRatio: number;
  bbWidth: number;
  activeStrategies: string[];
}

export type SignalStatus = "taken" | "rejected" | "expired" | "pending";

export interface Journal {
  recordSignal(signal: Signal, status: SignalStatus, score: number, rejectReason?: string): Promise<void>;
  recordTrade(trade: Trade): Promise<void>;
  recordEquity(point: EquityPoint): Promise<void>;
  recordRegime(rec: RegimeRecord): Promise<void>;
}

export class InMemoryJournal implements Journal {
  signals: Array<{ signal: Signal; status: SignalStatus; score: number; rejectReason?: string }> = [];
  trades: Trade[] = [];
  equity: EquityPoint[] = [];
  regimes: RegimeRecord[] = [];

  async recordSignal(signal: Signal, status: SignalStatus, score: number, rejectReason?: string): Promise<void> {
    this.signals.push({ signal, status, score, rejectReason });
  }
  async recordTrade(trade: Trade): Promise<void> {
    this.trades.push(trade);
  }
  async recordEquity(point: EquityPoint): Promise<void> {
    this.equity.push(point);
  }
  async recordRegime(rec: RegimeRecord): Promise<void> {
    this.regimes.push(rec);
  }
}

/** Minimal shape of the Prisma client this journal needs (avoids a hard dep). */
export interface PrismaLike {
  trade: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args?: { orderBy?: Record<string, string>; take?: number }): Promise<Record<string, unknown>[]>;
  };
  signal: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args?: { orderBy?: Record<string, string>; take?: number }): Promise<Record<string, unknown>[]>;
  };
  equitySnapshot: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args?: { orderBy?: Record<string, string>; take?: number }): Promise<Record<string, unknown>[]>;
  };
  regimeLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args?: { orderBy?: Record<string, string>; take?: number }): Promise<Record<string, unknown>[]>;
  };
}

export class PrismaJournal implements Journal {
  constructor(private readonly db: PrismaLike) {}

  async recordSignal(signal: Signal, status: SignalStatus, score: number, rejectReason?: string): Promise<void> {
    await this.db.signal.create({
      data: {
        symbol: signal.symbol, strategy: signal.strategy, direction: signal.direction,
        entryPrice: signal.entryPrice, stopLoss: signal.stopLoss,
        takeProfit1: signal.takeProfit1, takeProfit2: signal.takeProfit2,
        riskReward: signal.riskReward, confidence: signal.confidence, score,
        regime: signal.regime, status, rejectReason: rejectReason ?? null,
        reasoning: signal.reasoning, timestamp: new Date(signal.timestamp),
      },
    });
  }
  async recordTrade(t: Trade): Promise<void> {
    await this.db.trade.create({
      data: {
        symbol: t.symbol, strategy: t.strategy, regime: t.regime, direction: t.direction,
        entryTime: new Date(t.entryTime), exitTime: t.exitTime ? new Date(t.exitTime) : null,
        entryPrice: t.entryPrice, exitPrice: t.exitPrice ?? null, slPrice: t.slPrice,
        tp1Price: t.tp1Price, tp2Price: t.tp2Price, quantity: t.quantity, notional: t.notional,
        pnlUsdt: t.pnlUsdt ?? null, pnlPct: t.pnlPct ?? null, rMultiple: t.rMultiple ?? null,
        exitType: t.exitType ?? null, confidence: t.confidence,
        multiStrategyConfirm: t.multiStrategyConfirm, reasoning: t.reasoning ?? null,
        equityAfter: t.equityAfter ?? null,
      },
    });
  }
  async recordEquity(p: EquityPoint): Promise<void> {
    await this.db.equitySnapshot.create({
      data: { timestamp: new Date(p.timestamp), equity: p.equity, openPnl: p.openPnl, drawdownPct: p.drawdownPct, positionCount: p.positionCount },
    });
  }
  async recordRegime(r: RegimeRecord): Promise<void> {
    await this.db.regimeLog.create({
      data: {
        timestamp: new Date(r.timestamp), symbol: r.symbol, regime: r.regime,
        confidence: r.confidence, adx: r.adx, atrRatio: r.atrRatio, bbWidth: r.bbWidth,
        activeStrategies: JSON.stringify(r.activeStrategies),
      },
    });
  }
}
