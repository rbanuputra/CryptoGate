/**
 * Module 1B: Order-flow data — Open Interest, funding rate, long/short ratio.
 * Rolling windows per symbol, polled from Binance REST every 5-15 min.
 *
 * Convention: `fundingRate` and OI-change comparisons are in PERCENT units
 * (0.01 = 0.01%), matching the OI/liquidation strategy thresholds.
 */

export interface OrderFlowSnapshot {
  /** rolling OI values (oldest -> newest), notional USDⓈ */
  oi: number[];
  oiTimestamps: number[];
  /** current funding rate, in percent (e.g. 0.01 = 0.01%) */
  fundingRate: number;
  /** current global long/short account ratio */
  lsRatio: number;
}

export class OrderFlowStore {
  private oi: number[] = [];
  private oiTs: number[] = [];
  private funding: number[] = [];
  private ls: number[] = [];

  constructor(readonly symbol: string, private readonly maxOi = 100) {}

  pushOi(value: number, ts: number): void {
    this.oi.push(value);
    this.oiTs.push(ts);
    if (this.oi.length > this.maxOi) {
      this.oi.shift();
      this.oiTs.shift();
    }
  }
  pushFunding(rate: number): void {
    this.funding.push(rate);
    if (this.funding.length > 10) this.funding.shift();
  }
  pushLsRatio(ratio: number): void {
    this.ls.push(ratio);
    if (this.ls.length > 20) this.ls.shift();
  }

  snapshot(): OrderFlowSnapshot {
    return {
      oi: [...this.oi],
      oiTimestamps: [...this.oiTs],
      fundingRate: this.funding[this.funding.length - 1] ?? 0,
      lsRatio: this.ls[this.ls.length - 1] ?? 1,
    };
  }
}

const FAPI = "https://fapi.binance.com";

/** Current open interest (base units). Multiply by price for notional if needed. */
export async function fetchOpenInterest(symbol: string): Promise<number> {
  const res = await fetch(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`);
  if (!res.ok) throw new Error(`openInterest ${symbol} HTTP ${res.status}`);
  const j = (await res.json()) as { openInterest: string };
  return Number(j.openInterest);
}

/** Latest funding rate, returned in PERCENT (Binance gives a fraction). */
export async function fetchFundingRate(symbol: string): Promise<number> {
  const res = await fetch(`${FAPI}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
  if (!res.ok) throw new Error(`fundingRate ${symbol} HTTP ${res.status}`);
  const arr = (await res.json()) as Array<{ fundingRate: string }>;
  return Number(arr[0]?.fundingRate ?? 0) * 100;
}

/** Latest global long/short account ratio (15m). */
export async function fetchLongShortRatio(symbol: string): Promise<number> {
  const res = await fetch(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=15m&limit=1`);
  if (!res.ok) throw new Error(`longShortRatio ${symbol} HTTP ${res.status}`);
  const arr = (await res.json()) as Array<{ longShortRatio: string }>;
  return Number(arr[0]?.longShortRatio ?? 1);
}
