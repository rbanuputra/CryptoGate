/**
 * Module 9: Notifications. `Notifier` is the port; templates render trade events.
 * `TelegramNotifier` posts to the Bot API; `ConsoleNotifier` logs locally.
 */
import type { Signal, Trade } from "@cryptogate/shared";

export interface Notifier {
  send(message: string): Promise<void>;
}

export const templates = {
  entry(signal: Signal, quantity: number, notional: number): string {
    const arrow = signal.direction === "long" ? "🟢 LONG" : "🔴 SHORT";
    return (
      `${arrow} ${signal.symbol} @ ${signal.entryPrice}\n` +
      `📊 ${signal.strategy} | ${signal.regime}\n` +
      `🎯 TP1 ${signal.takeProfit1} | TP2 ${signal.takeProfit2}\n` +
      `🛑 SL ${signal.stopLoss} | R:R ${signal.riskReward}\n` +
      `💰 ${quantity} ($${notional.toFixed(2)}) | 🧠 ${signal.confidence}\n` +
      signal.reasoning
    );
  },
  tp1(symbol: string, pnlPct: number): string {
    return `✅ TP1 HIT ${symbol} | +${pnlPct.toFixed(2)}% | SL → BE`;
  },
  tp2(symbol: string, pnlPct: number, equity: number): string {
    return `🎯 TP2 HIT ${symbol} | +${pnlPct.toFixed(2)}% | Equity $${equity.toFixed(2)}`;
  },
  sl(symbol: string, pnlPct: number, equity: number, breakeven: boolean): string {
    return `${breakeven ? "⚪ SL(BE)" : "🔴 SL HIT"} ${symbol} | ${pnlPct.toFixed(2)}% | Equity $${equity.toFixed(2)}`;
  },
  closed(trade: Trade): string {
    const sign = (trade.pnlUsdt ?? 0) >= 0 ? "+" : "";
    return `📕 CLOSED ${trade.symbol} ${trade.exitType} | ${sign}$${(trade.pnlUsdt ?? 0).toFixed(2)} (${(trade.rMultiple ?? 0).toFixed(2)}R) | Equity $${(trade.equityAfter ?? 0).toFixed(2)}`;
  },
  circuitBreaker(): string {
    return "⚠️ CIRCUIT BREAKER — daily loss limit reached. Trading paused.";
  },
  drawdown(pct: number, mult: number): string {
    return `⚠️ Drawdown ${pct.toFixed(1)}% — position size reduced to ${mult}x`;
  },
  dailySummary(p: {
    totalTrades: number; wins: number; losses: number;
    dailyPnl: number; dailyPnlPct: number;
    equity: number; dominantRegime: string; activeStrategies: string[];
  }): string {
    const sign = p.dailyPnl >= 0 ? "+" : "";
    return (
      `📅 Daily Summary\n` +
      `Trades: ${p.totalTrades} | Win: ${p.wins} | Loss: ${p.losses}\n` +
      `PnL: ${sign}$${p.dailyPnl.toFixed(2)} (${sign}${p.dailyPnlPct.toFixed(2)}%)\n` +
      `Equity: $${p.equity.toFixed(2)}\n` +
      `Regime: ${p.dominantRegime}\n` +
      `Strategies: ${p.activeStrategies.join(", ")}`
    );
  },
};

export class ConsoleNotifier implements Notifier {
  async send(message: string): Promise<void> {
    console.log("[notify]", message.replace(/\n/g, " | "));
  }
}

export class TelegramNotifier implements Notifier {
  constructor(private readonly token: string, private readonly chatId: string) {}
  async send(message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text: message }),
    });
    if (!res.ok) throw new Error(`telegram HTTP ${res.status}`);
  }
}

/** Fan-out to several notifiers; one failure never blocks the others. */
export class MultiNotifier implements Notifier {
  constructor(private readonly targets: Notifier[]) {}
  async send(message: string): Promise<void> {
    await Promise.all(this.targets.map((t) => t.send(message).catch((e) => console.error("[notify] fail", e))));
  }
}
