export type TradingSession = "london" | "new_york" | "off";

/** London 07:00-11:00 UTC, New York 12:00-16:00 UTC. */
export function sessionOf(epochMs: number): TradingSession {
  const hour = new Date(epochMs).getUTCHours();
  if (hour >= 7 && hour < 11) return "london";
  if (hour >= 12 && hour < 16) return "new_york";
  return "off";
}

export function inTradingSession(epochMs: number): boolean {
  return sessionOf(epochMs) !== "off";
}

export function utcDayKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
