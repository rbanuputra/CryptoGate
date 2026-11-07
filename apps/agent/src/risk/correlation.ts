/** Correlation grouping — avoid stacking directional exposure in correlated assets. */
import type { Direction } from "@cryptogate/shared";

export const CORRELATION_GROUPS: string[][] = [
  ["BTCUSDT", "ETHUSDT"],
  ["SOLUSDT", "ETHUSDT"],
  ["DOGEUSDT", "1000PEPEUSDT"],
];

export function areCorrelated(a: string, b: string): boolean {
  if (a === b) return true;
  return CORRELATION_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

export interface OpenLike {
  symbol: string;
  direction: Direction;
}

/** Count existing positions correlated with (symbol, direction) in the SAME direction. */
export function countCorrelatedPositions(
  symbol: string,
  direction: Direction,
  open: OpenLike[],
): number {
  return open.filter((p) => p.direction === direction && p.symbol !== symbol && areCorrelated(symbol, p.symbol)).length;
}
