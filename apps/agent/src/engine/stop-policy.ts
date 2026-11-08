/**
 * Volatility-adaptive stop floor.
 *
 * Strategies place their SL structurally (beyond a wick / level / VWAP ± a few
 * tenths of an ATR). In quiet markets that can be so tight that noise or fees
 * decide the trade. Instead of a fixed % limit, we enforce a floor that scales
 * with the current ATR: if the SL is closer than `minStopAtr` × ATR it is
 * pushed out to that distance. TP1/TP2 keep their original R multiples, so the
 * R:R is unchanged; position size shrinks automatically (risk-based sizing).
 */
import type { Signal } from "@cryptogate/shared";

export interface StopPolicy {
  /** SL distance is never smaller than this many ATRs (current 15m ATR14). */
  minStopAtr: number;
}

export const STOP_POLICY_DEFAULT: StopPolicy = { minStopAtr: 1.5 };

export function applyStopFloor(signal: Signal, atrValue: number, policy: StopPolicy): Signal {
  if (!(atrValue > 0) || !(policy.minStopAtr > 0)) return signal;
  const entry = signal.entryPrice;
  const risk = Math.abs(entry - signal.stopLoss);
  if (risk <= 0) return signal;
  const floor = policy.minStopAtr * atrValue;
  if (risk >= floor) return signal;

  const long = signal.direction === "long";
  const k1 = Math.abs(signal.takeProfit1 - entry) / risk;
  const k2 = Math.abs(signal.takeProfit2 - entry) / risk;
  const at = (k: number) => (long ? entry + k * floor : entry - k * floor);

  return {
    ...signal,
    stopLoss: long ? entry - floor : entry + floor,
    takeProfit1: at(k1),
    takeProfit2: at(k2),
    reasoning: `${signal.reasoning} | SL widened to ${policy.minStopAtr} ATR`,
    meta: { ...signal.meta, originalStopLoss: signal.stopLoss },
  };
}
