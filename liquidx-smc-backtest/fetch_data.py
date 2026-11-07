"""
fetch_data.py — Download OHLCV klines from Binance USDⓈ-M Futures.

- Paginates with startTime/endTime to get full history from DATA_START.
- Falls back to Bybit for symbols not on Binance Futures (e.g. HYPE).
- Validates: no timestamp gaps, volume >= 0, low <= open/close <= high.
- Writes data/{symbol_lower}_{tf}.csv and data/fetch_log.json

Run:  python fetch_data.py
      python fetch_data.py --symbols BTCUSDT ETHUSDT --tf 15m 4h
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone

import requests

from configs import SYMBOLS, FETCH_TIMEFRAMES, DATA_START

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
BINANCE_FAPI = "https://fapi.binance.com/fapi/v1/klines"
BYBIT_API = "https://api.bybit.com/v5/market/kline"
BITGET_API = "https://api.bitget.com/api/v2/mix/market/history-candles"

# interval -> milliseconds
TF_MS = {
    "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
}
# bybit interval codes
BYBIT_TF = {"15m": "15", "1h": "60", "4h": "240", "1d": "D"}
# bitget v2 mix interval codes (minutes lowercase, hours/days uppercase)
BITGET_TF = {"15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D"}

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "liquidx-smc-backtest/1.0"})


def _to_ms(date_str: str) -> int:
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _now_ms() -> int:
    return int(time.time() * 1000)


# --------------------------------------------------------------------------- #
# Binance
# --------------------------------------------------------------------------- #
def fetch_binance(symbol: str, interval: str, start_ms: int, end_ms: int):
    """Return list of [ts, o, h, l, c, v] ascending, or raise on hard failure."""
    out = []
    step = TF_MS[interval]
    cursor = start_ms
    while cursor < end_ms:
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": cursor,
            "endTime": end_ms,
            "limit": 1500,
        }
        for attempt in range(5):
            r = SESSION.get(BINANCE_FAPI, params=params, timeout=20)
            if r.status_code == 200:
                break
            if r.status_code in (418, 429):
                wait = 2 ** attempt
                time.sleep(wait)
                continue
            # 400 = symbol not found / bad params -> signal caller to try fallback
            raise RuntimeError(f"binance {symbol} {interval} HTTP {r.status_code}: {r.text[:120]}")
        else:
            raise RuntimeError(f"binance {symbol} {interval} rate-limited repeatedly")

        rows = r.json()
        if not rows:
            break
        for k in rows:
            out.append([int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])])
        last_open = rows[-1][0]
        nxt = last_open + step
        if nxt <= cursor:          # no progress
            break
        cursor = nxt
        if len(rows) < 1500:       # reached the end of available data
            break
        time.sleep(0.12)           # be gentle on the public endpoint
    return out


# --------------------------------------------------------------------------- #
# Bybit fallback (linear perpetual)
# --------------------------------------------------------------------------- #
def fetch_bybit(symbol: str, interval: str, start_ms: int, end_ms: int):
    out = []
    step = TF_MS[interval]
    bybit_iv = BYBIT_TF.get(interval)
    if bybit_iv is None:
        raise RuntimeError(f"bybit unsupported interval {interval}")
    cursor = start_ms
    while cursor < end_ms:
        params = {
            "category": "linear", "symbol": symbol, "interval": bybit_iv,
            "start": cursor, "end": end_ms, "limit": 1000,
        }
        r = SESSION.get(BYBIT_API, params=params, timeout=20)
        if r.status_code != 200:
            raise RuntimeError(f"bybit {symbol} {interval} HTTP {r.status_code}")
        payload = r.json()
        rows = payload.get("result", {}).get("list", [])
        if not rows:
            break
        # bybit returns DESC; ascending sort
        rows = sorted(rows, key=lambda k: int(k[0]))
        for k in rows:
            out.append([int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])])
        last_open = int(rows[-1][0])
        nxt = last_open + step
        if nxt <= cursor:
            break
        cursor = nxt
        if len(rows) < 1000:
            break
        time.sleep(0.15)
    return out


# --------------------------------------------------------------------------- #
# Bitget fallback (USDⓈ-M perpetual). Public, no API key.
# history-candles is endTime-based (max 200/req), so we page backwards.
# --------------------------------------------------------------------------- #
def fetch_bitget(symbol: str, interval: str, start_ms: int, end_ms: int):
    out = []
    step = TF_MS[interval]
    gran = BITGET_TF.get(interval)
    if gran is None:
        raise RuntimeError(f"bitget unsupported interval {interval}")
    end_cursor = end_ms
    guard = 0
    while end_cursor > start_ms and guard < 100_000:
        guard += 1
        params = {
            "symbol": symbol, "productType": "USDT-FUTURES",
            "granularity": gran, "endTime": end_cursor, "limit": 200,
        }
        for attempt in range(5):
            r = SESSION.get(BITGET_API, params=params, timeout=20)
            if r.status_code == 200:
                break
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"bitget {symbol} {interval} HTTP {r.status_code}: {r.text[:120]}")
        else:
            raise RuntimeError(f"bitget {symbol} {interval} rate-limited repeatedly")

        payload = r.json()
        if str(payload.get("code")) != "00000":
            raise RuntimeError(f"bitget {symbol} {interval} err "
                               f"{payload.get('code')}: {payload.get('msg')}")
        rows = payload.get("data", [])
        if not rows:
            break
        rows = sorted(rows, key=lambda k: int(k[0]))  # [ts,o,h,l,c,baseVol,quoteVol]
        for k in rows:
            out.append([int(k[0]), float(k[1]), float(k[2]), float(k[3]),
                        float(k[4]), float(k[5])])
        earliest = int(rows[0][0])
        if earliest <= start_ms or earliest >= end_cursor:
            break
        end_cursor = earliest  # next page ends just before this batch
        time.sleep(0.06)        # 20 req/s limit
    return [r for r in out if r[0] >= start_ms]


# --------------------------------------------------------------------------- #
# Validation & write
# --------------------------------------------------------------------------- #
def validate(rows, interval):
    """De-dupe, sort, drop malformed candles, report gaps. Returns (clean, issues)."""
    issues = {"gaps": 0, "bad_ohlc": 0, "neg_vol": 0, "dupes": 0}
    step = TF_MS[interval]
    seen = {}
    for r in rows:
        ts, o, h, l, c, v = r
        if not (l <= o <= h and l <= c <= h) or h < l:
            issues["bad_ohlc"] += 1
            continue
        if v < 0:
            issues["neg_vol"] += 1
            continue
        if ts in seen:
            issues["dupes"] += 1
        seen[ts] = [ts, o, h, l, c, v]
    clean = [seen[k] for k in sorted(seen)]
    for i in range(1, len(clean)):
        gap = clean[i][0] - clean[i - 1][0]
        if gap > step:
            issues["gaps"] += int(gap / step) - 1
    return clean, issues


def write_csv(path, rows):
    with open(path, "w") as f:
        f.write("timestamp,open,high,low,close,volume\n")
        for ts, o, h, l, c, v in rows:
            f.write(f"{ts},{o},{h},{l},{c},{v}\n")


def listing_start_ms(symbol):
    """Earliest sensible start; the fetch naturally clamps to real listing date."""
    return _to_ms(DATA_START)


FETCHERS = {"binance": fetch_binance, "bybit": fetch_bybit, "bitget": fetch_bitget}


def fetch_symbol(symbol, timeframes, log, sources):
    end_ms = _now_ms()
    start_ms = listing_start_ms(symbol)
    for tf in timeframes:
        key = f"{symbol}_{tf}"
        rows, source, errors = None, None, []
        for src in sources:
            try:
                got = FETCHERS[src](symbol, tf, start_ms, end_ms)
                if not got:
                    raise RuntimeError("empty response")
                rows, source = got, src
                break
            except Exception as e:
                errors.append(f"{src}: {e}")
                if src != sources[-1]:
                    print(f"  [!] {src} failed for {symbol} {tf}: {e} — trying next source")
        if rows is None:
            print(f"  [SKIP] {symbol} {tf}: all sources failed")
            log[key] = {"status": "skipped", "reason": " | ".join(errors)}
            continue

        clean, issues = validate(rows, tf)
        if not clean:
            print(f"  [SKIP] {symbol} {tf}: no valid candles after cleaning")
            log[key] = {"status": "skipped", "reason": "no valid candles"}
            continue

        path = os.path.join(DATA_DIR, f"{symbol.lower()}_{tf}.csv")
        write_csv(path, clean)
        first = datetime.fromtimestamp(clean[0][0] / 1000, timezone.utc).strftime("%Y-%m-%d")
        last = datetime.fromtimestamp(clean[-1][0] / 1000, timezone.utc).strftime("%Y-%m-%d")
        span_days = (clean[-1][0] - clean[0][0]) / 86_400_000
        short = span_days < 730
        log[key] = {
            "status": "ok", "source": source, "candles": len(clean),
            "first": first, "last": last, "span_days": round(span_days, 1),
            "short_history": short, "issues": issues,
        }
        flag = "  ⚠ SHORT HISTORY" if short else ""
        print(f"  [OK] {symbol} {tf}: {len(clean)} candles {first}→{last} "
              f"({source}) gaps={issues['gaps']}{flag}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", nargs="*", default=[s["symbol"] for s in SYMBOLS])
    ap.add_argument("--tf", nargs="*", default=FETCH_TIMEFRAMES)
    ap.add_argument("--source", nargs="*", default=["binance", "bybit", "bitget"],
                    choices=["binance", "bybit", "bitget"],
                    help="exchange order to try (first that works wins). "
                         "e.g. --source bitget   or   --source bitget binance")
    args = ap.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    log_path = os.path.join(DATA_DIR, "fetch_log.json")
    log = {}
    if os.path.exists(log_path):
        try:
            log = json.load(open(log_path))
        except Exception:
            log = {}

    print(f"Source order: {' -> '.join(args.source)}")
    for symbol in args.symbols:
        print(f"\n=== {symbol} ===")
        fetch_symbol(symbol, args.tf, log, args.source)
        log["_updated"] = datetime.now(timezone.utc).isoformat()
        json.dump(log, open(log_path, "w"), indent=2)

    print(f"\nDone. Log -> {log_path}")


if __name__ == "__main__":
    main()
