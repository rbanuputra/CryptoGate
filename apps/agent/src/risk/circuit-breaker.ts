/**
 * Daily circuit breaker + loss-streak guard.
 * Tracks per-UTC-day equity, realized loss, trade count and consecutive losses.
 */
import { utcDayKey } from "@cryptogate/shared";

export interface CircuitBreakerConfig {
  maxDailyLossPct: number; // fraction of start-of-day equity
  maxDailyTrades: number;
  maxConsecutiveLosses: number;
}

export const CIRCUIT_DEFAULT: CircuitBreakerConfig = {
  maxDailyLossPct: 0.5,
  maxDailyTrades: 10,
  maxConsecutiveLosses: 4,
};

export class CircuitBreaker {
  private dayKey: string;
  private dayStartEquity: number;
  private dayLoss = 0;
  private dayTrades = 0;
  private consecutiveLosses = 0;

  constructor(private readonly cfg: CircuitBreakerConfig, startEquity: number, now = Date.now()) {
    this.dayKey = utcDayKey(now);
    this.dayStartEquity = startEquity;
  }

  /** Roll the day window if we've crossed into a new UTC day. */
  tick(now: number, equity: number): void {
    const key = utcDayKey(now);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayStartEquity = equity;
      this.dayLoss = 0;
      this.dayTrades = 0;
      this.consecutiveLosses = 0;
    }
  }

  canTrade(): { ok: boolean; reason?: string } {
    if (this.dayTrades >= this.cfg.maxDailyTrades) return { ok: false, reason: "Max daily trades reached" };
    if (this.consecutiveLosses >= this.cfg.maxConsecutiveLosses)
      return { ok: false, reason: `Paused after ${this.consecutiveLosses} consecutive losses` };
    if (this.dayLoss >= this.cfg.maxDailyLossPct * this.dayStartEquity)
      return { ok: false, reason: "Daily loss circuit breaker" };
    return { ok: true };
  }

  recordOpen(): void {
    this.dayTrades++;
  }

  recordClose(pnl: number): void {
    if (pnl < 0) {
      this.dayLoss += -pnl;
      this.consecutiveLosses++;
    } else if (pnl > 0) {
      this.consecutiveLosses = 0;
    }
  }

  snapshot() {
    return {
      dayKey: this.dayKey,
      dayStartEquity: this.dayStartEquity,
      dayLoss: this.dayLoss,
      dayTrades: this.dayTrades,
      consecutiveLosses: this.consecutiveLosses,
    };
  }
}
