"""
backtest_engine.py — Core LiquidX SMC Scalper backtest (symbol-agnostic).

Implements, bar-by-bar on the chart TF with HTF liquidity context:
  HTF liquidity pivots -> sweep -> displacement -> OB/FVG zone retest -> entry
with realistic execution (next-bar-open fills, slippage, taker fees, funding),
TP1/TP2/breakeven management, drawdown risk scaling and a daily circuit breaker.

No look-ahead: a signal on bar i is filled at bar i+1 open; zones must pre-exist
the bar that retests them; HTF levels are only visible after the HTF bar closes.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

TF_MS = {"15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}


# --------------------------------------------------------------------------- #
# Indicators
# --------------------------------------------------------------------------- #
def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    return true_range(df).rolling(period, min_periods=1).mean()


def pivots(high: np.ndarray, low: np.ndarray, left: int, right: int):
    """Return (is_ph, is_pl) boolean arrays; pivot centered at index i,
    confirmed only once bar i+right has formed (caller must respect that)."""
    n = len(high)
    is_ph = np.zeros(n, dtype=bool)
    is_pl = np.zeros(n, dtype=bool)
    for i in range(left, n - right):
        h = high[i]
        l = low[i]
        if h > high[i - left:i].max(initial=-np.inf) and h > high[i + 1:i + right + 1].max(initial=-np.inf):
            is_ph[i] = True
        if l < low[i - left:i].min(initial=np.inf) and l < low[i + 1:i + right + 1].min(initial=np.inf):
            is_pl[i] = True
    return is_ph, is_pl


# --------------------------------------------------------------------------- #
# HTF liquidity levels -> availability events on the chart timeline
# --------------------------------------------------------------------------- #
def build_htf_level_events(htf: pd.DataFrame, htf_tf: str, swing_len: int):
    """Each event: (available_ms, side, price) where side 'bsl' (pivot low =
    buy-side liq) or 'ssl' (pivot high = sell-side liq). available_ms is the
    HTF bar close time so chart bars only see confirmed pivots."""
    high = htf["high"].to_numpy()
    low = htf["low"].to_numpy()
    ts = htf["timestamp"].to_numpy()
    dur = TF_MS[htf_tf]
    is_ph, is_pl = pivots(high, low, swing_len, swing_len)
    events = []
    for i in range(len(htf)):
        confirm_idx = i + swing_len
        if confirm_idx >= len(htf):
            continue
        avail = int(ts[confirm_idx]) + dur  # close time of the confirming bar
        if is_ph[i]:
            events.append((avail, "ssl", float(high[i])))
        if is_pl[i]:
            events.append((avail, "bsl", float(low[i])))
    events.sort(key=lambda e: e[0])
    return events


# --------------------------------------------------------------------------- #
# Core backtest
# --------------------------------------------------------------------------- #
def run_backtest(chart: pd.DataFrame, htf: pd.DataFrame, config: dict,
                 exec_cfg: dict, slippage: float, symbol: str, tf_name: str,
                 chart_tf: str, htf_tf: str):
    cfg = config
    n = len(chart)

    o = chart["open"].to_numpy(dtype=float)
    h = chart["high"].to_numpy(dtype=float)
    l = chart["low"].to_numpy(dtype=float)
    c = chart["close"].to_numpy(dtype=float)
    vol = chart["volume"].to_numpy(dtype=float)
    ts = chart["timestamp"].to_numpy(dtype=np.int64)

    atr_arr = atr(chart, 14).to_numpy()
    atr_sma = pd.Series(atr_arr).rolling(100, min_periods=20).mean().to_numpy()
    vol_sma = pd.Series(vol).rolling(20, min_periods=5).mean().to_numpy()

    is_ph, is_pl = pivots(h, l, cfg["swing_len"], cfg["swing_len"])

    level_events = build_htf_level_events(htf, htf_tf, cfg["swing_len"])
    ev_idx = 0
    bsl_levels, ssl_levels = [], []   # each: {"price":..., "swept":False}

    # state -----------------------------------------------------------------
    zones = []  # {type,side,top,bottom,born}
    last_bull_sweep = {"bar": -10**9, "wick": None, "level": None}
    last_bear_sweep = {"bar": -10**9, "wick": None, "level": None}
    trend = 0
    last_bull_struct = -10**9
    last_bear_struct = -10**9
    last_ph_val = None
    last_pl_val = None
    last_signal_bar = -10**9

    # account ---------------------------------------------------------------
    equity = exec_cfg["start_equity"]
    peak_equity = equity
    halted = False
    day_key = None
    day_start_equity = equity
    day_loss = 0.0
    pending = None     # scheduled entry dict
    pos = None         # open position dict
    trades = []
    curve = []
    last_fund_window = None

    def utc_hour(ms):
        return datetime.fromtimestamp(ms / 1000, timezone.utc).hour

    def session_of(ms):
        hr = utc_hour(ms)
        if 7 <= hr < 11:
            return "london"
        if 12 <= hr < 16:
            return "new_york"
        return "off"

    def adaptive_factors(i):
        if not cfg["auto_adapt"] or atr_sma[i] is None or np.isnan(atr_sma[i]) or atr_sma[i] == 0:
            return 1.0
        regime = atr_arr[i] / atr_sma[i]
        return float(min(1.3, max(0.7, regime)))

    for i in range(n):
        price_ts = int(ts[i])
        a = atr_arr[i]
        if np.isnan(a) or a <= 0:
            a = max(c[i] * 0.0005, 1e-9)

        # ---- new UTC day bookkeeping --------------------------------------
        dk = datetime.fromtimestamp(price_ts / 1000, timezone.utc).strftime("%Y-%m-%d")
        if dk != day_key:
            day_key = dk
            day_start_equity = equity
            day_loss = 0.0

        # ---- funding accrual on open position -----------------------------
        if pos is not None:
            win = price_ts // (exec_cfg["funding_interval_h"] * 3_600_000)
            if last_fund_window is not None and win > last_fund_window:
                crossings = int(win - last_fund_window)
                pos["funding"] += pos["notional"] * exec_cfg["funding_pct"] * crossings
            last_fund_window = win

        # ---- 1. execute pending entry at THIS bar open --------------------
        if pending is not None and pos is None:
            side = pending["side"]
            fill = o[i] * (1 + slippage) if side == "long" else o[i] * (1 - slippage)
            sl = pending["sl"]
            risk_per_unit = abs(fill - sl)
            if risk_per_unit <= 0:
                pending = None
            else:
                size_factor = pending["size_factor"]
                risk_dollar = equity * exec_cfg["risk_pct"] * size_factor
                units = risk_dollar / risk_per_unit
                notional = fill * units
                if side == "long":
                    tp1 = fill + cfg["tp1_rr"] * risk_per_unit
                    tp2 = fill + cfg["tp2_rr"] * risk_per_unit
                else:
                    tp1 = fill - cfg["tp1_rr"] * risk_per_unit
                    tp2 = fill - cfg["tp2_rr"] * risk_per_unit
                pos = {
                    "side": side, "entry": fill, "entry_bar": i, "entry_ts": price_ts,
                    "sl": sl, "sl0": sl, "tp1": tp1, "tp2": tp2, "units": units,
                    "notional": notional, "risk_unit": risk_per_unit, "remaining": 1.0,
                    "tp1_done": False, "entry_fee": notional * exec_cfg["taker_fee_pct"],
                    "funding": 0.0, "realized": 0.0,
                    "entry_type": pending["entry_type"], "swept_level": pending["level"],
                    "swept_wick": pending["wick"], "zone_top": pending["zone_top"],
                    "zone_bot": pending["zone_bot"], "regime": pending["regime"],
                    "session": session_of(price_ts), "size_factor": size_factor,
                }
                last_fund_window = price_ts // (exec_cfg["funding_interval_h"] * 3_600_000)
            pending = None

        # ---- 2. manage open position exits on THIS bar --------------------
        if pos is not None:
            closed = _process_exits(pos, h[i], l[i], c[i], i, price_ts, slippage, exec_cfg)
            if closed is not None:
                equity += closed["pnl_dollar"]
                day_loss += -closed["pnl_dollar"] if closed["pnl_dollar"] < 0 else 0.0
                peak_equity = max(peak_equity, equity)
                closed.update({
                    "trade_id": len(trades) + 1, "symbol": symbol,
                    "config": cfg["name"], "tf": tf_name, "equity_after": equity,
                })
                trades.append(closed)
                pos = None

        # ---- drawdown state ----------------------------------------------
        dd = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0.0
        if dd > 0.15:
            halted = True
        elif halted and dd < exec_cfg["dd_resume_level"]:
            halted = False
        size_factor = 1.0
        if dd > 0.10:
            size_factor = 0.5
        elif dd > 0.05:
            size_factor = 0.75

        # ---- adaptive params ---------------------------------------------
        rf = adaptive_factors(i)
        disp_mult = cfg["displacement_mult"] * rf
        sweep_wick_min = cfg["sweep_wick_min"] * rf
        cooldown = round(cfg["cooldown_bars"] * rf) if cfg["auto_adapt"] else cfg["cooldown_bars"]

        # ---- 4. refresh HTF liquidity pool (only confirmed levels) --------
        while ev_idx < len(level_events) and level_events[ev_idx][0] <= price_ts:
            _, lside, price = level_events[ev_idx]
            pool = bsl_levels if lside == "bsl" else ssl_levels
            if not any(abs(price - x["price"]) / max(price, 1e-9) < 0.001 and not x["swept"] for x in pool):
                pool.append({"price": price, "swept": False})
                if len(pool) > 10:
                    pool.pop(0)
            ev_idx += 1

        # ---- 5. sweep detection on this bar -------------------------------
        for lv in bsl_levels:
            if not lv["swept"] and (lv["price"] - l[i]) >= sweep_wick_min * a and c[i] > lv["price"]:
                lv["swept"] = True
                last_bull_sweep = {"bar": i, "wick": l[i], "level": lv["price"]}
        for lv in ssl_levels:
            if not lv["swept"] and (h[i] - lv["price"]) >= sweep_wick_min * a and c[i] < lv["price"]:
                lv["swept"] = True
                last_bear_sweep = {"bar": i, "wick": h[i], "level": lv["price"]}

        # ---- 6. age / mitigate existing zones -----------------------------
        alive = []
        for z in zones:
            if i - z["born"] > cfg["zone_max_age"]:
                continue
            if z["side"] == "bull" and l[i] < z["bottom"]:
                continue  # mitigated
            if z["side"] == "bear" and h[i] > z["top"]:
                continue
            alive.append(z)
        zones = alive

        # ---- 7. entry signal (flat, no pending) ---------------------------
        if pos is None and pending is None and not halted and i >= 50:
            in_session = (not cfg["session_filter"]) or session_of(price_ts) != "off"
            vol_ok = (not cfg["vol_filter"]) or (not np.isnan(vol_sma[i]) and vol[i] > vol_sma[i] * cfg["vol_spike_mult"])
            cooldown_ok = (i - last_signal_bar) >= cooldown
            day_ok = day_loss < exec_cfg["daily_loss_limit"] * day_start_equity

            if in_session and vol_ok and cooldown_ok and day_ok:
                # LONG
                recent_bull = (i - last_bull_sweep["bar"]) <= cfg["sweep_lookback"]
                struct_long = (trend == 1) or ((i - last_bull_struct) <= cfg["sweep_lookback"])
                if recent_bull and (struct_long or not cfg["choch_required"]):
                    z = _retest_zone(zones, "bull", h[i], l[i], c[i], o[i])
                    if z is not None:
                        sl = last_bull_sweep["wick"] - a * cfg["sl_buffer"]
                        pending = _mk_pending("long", sl, z, last_bull_sweep, rf, size_factor)
                        last_signal_bar = i
                # SHORT
                if pending is None:
                    recent_bear = (i - last_bear_sweep["bar"]) <= cfg["sweep_lookback"]
                    struct_short = (trend == -1) or ((i - last_bear_struct) <= cfg["sweep_lookback"])
                    if recent_bear and (struct_short or not cfg["choch_required"]):
                        z = _retest_zone(zones, "bear", h[i], l[i], c[i], o[i])
                        if z is not None:
                            sl = last_bear_sweep["wick"] + a * cfg["sl_buffer"]
                            pending = _mk_pending("short", sl, z, last_bear_sweep, rf, size_factor)
                            last_signal_bar = i

        # ---- 8. detect new zones for future bars --------------------------
        body = abs(c[i] - o[i])
        bull_disp = body > disp_mult * a and c[i] > o[i]
        bear_disp = body > disp_mult * a and c[i] < o[i]
        if cfg["ob_enabled"]:
            if bull_disp:
                for k in range(i - 1, max(i - 6, -1), -1):
                    if c[k] < o[k]:  # last bearish candle
                        zones.append({"type": "OB", "side": "bull", "top": h[k], "bottom": l[k], "born": i})
                        break
            if bear_disp:
                for k in range(i - 1, max(i - 6, -1), -1):
                    if c[k] > o[k]:  # last bullish candle
                        zones.append({"type": "OB", "side": "bear", "top": h[k], "bottom": l[k], "born": i})
                        break
        if cfg["fvg_enabled"] and i >= 2:
            if l[i] > h[i - 2] and c[i - 1] > o[i - 1]:
                zones.append({"type": "FVG", "side": "bull", "top": l[i], "bottom": h[i - 2], "born": i})
            if h[i] < l[i - 2] and c[i - 1] < o[i - 1]:
                zones.append({"type": "FVG", "side": "bear", "top": h[i], "bottom": l[i - 2], "born": i})

        # ---- 9. structure update (pivot centered at i-swing_len) ----------
        center = i - cfg["swing_len"]
        if center >= 0:
            if is_ph[center]:
                v = h[center]
                if last_ph_val is not None and v > last_ph_val:
                    trend = 1
                    last_bull_struct = i
                last_ph_val = v
            if is_pl[center]:
                v = l[center]
                if last_pl_val is not None and v < last_pl_val:
                    trend = -1
                    last_bear_struct = i
                last_pl_val = v

        # ---- equity curve point (mark-to-market) --------------------------
        mtm = equity
        if pos is not None:
            if pos["side"] == "long":
                mtm += (c[i] - pos["entry"]) * pos["units"] * pos["remaining"]
            else:
                mtm += (pos["entry"] - c[i]) * pos["units"] * pos["remaining"]
        dd_now = (peak_equity - mtm) / peak_equity if peak_equity > 0 else 0.0
        curve.append((price_ts, round(mtm, 2), round(dd_now * 100, 3),
                      pos["side"] if pos else "flat"))

    # close any still-open position at last close -------------------------
    if pos is not None:
        closed = _force_close(pos, c[-1], int(ts[-1]), slippage, exec_cfg)
        equity += closed["pnl_dollar"]
        peak_equity = max(peak_equity, equity)
        closed.update({"trade_id": len(trades) + 1, "symbol": symbol,
                       "config": cfg["name"], "tf": tf_name, "equity_after": equity})
        trades.append(closed)

    return {"trades": trades, "curve": curve, "final_equity": equity,
            "start_equity": exec_cfg["start_equity"]}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _retest_zone(zones, side, hi, lo, cl, op):
    """Return a matching active zone that this bar retests, else None.
    Long: low<=top, close>bottom, close>open. Short mirrors."""
    best = None
    for z in zones:
        if z["side"] != side:
            continue
        if side == "bull":
            if lo <= z["top"] and cl > z["bottom"] and cl > op:
                if best is None or z["top"] > best["top"]:
                    best = z
        else:
            if hi >= z["bottom"] and cl < z["top"] and cl < op:
                if best is None or z["bottom"] < best["bottom"]:
                    best = z
    return best


def _mk_pending(side, sl, zone, sweep, rf, size_factor):
    return {
        "side": side, "sl": sl, "entry_type": zone["type"],
        "zone_top": zone["top"], "zone_bot": zone["bottom"],
        "level": sweep["level"], "wick": sweep["wick"],
        "regime": round(rf, 4), "size_factor": size_factor,
    }


def _leg_pnl(pos, exit_price, fraction, exec_cfg):
    units = pos["units"] * fraction
    if pos["side"] == "long":
        gross = (exit_price - pos["entry"]) * units
    else:
        gross = (pos["entry"] - exit_price) * units
    exit_fee = exit_price * units * exec_cfg["taker_fee_pct"]
    entry_fee = pos["entry_fee"] * fraction
    return gross - exit_fee - entry_fee


def _finalize(pos, exit_price, exit_ts, exit_bar, exit_type, extra_pnl):
    entry_dt = datetime.fromtimestamp(pos["entry_ts"] / 1000, timezone.utc)
    exit_dt = datetime.fromtimestamp(exit_ts / 1000, timezone.utc)
    total_pnl = pos["realized"] + extra_pnl - pos["funding"]
    risk_dollar = pos["risk_unit"] * pos["units"]
    r_mult = total_pnl / risk_dollar if risk_dollar > 0 else 0.0
    return {
        "entry_time": entry_dt.isoformat(), "exit_time": exit_dt.isoformat(),
        "direction": pos["side"], "entry_type": pos["entry_type"],
        "entry_price": round(pos["entry"], 8), "sl_price": round(pos["sl0"], 8),
        "tp1_price": round(pos["tp1"], 8), "tp2_price": round(pos["tp2"], 8),
        "exit_price": round(exit_price, 8), "exit_type": exit_type,
        "pnl_dollar": round(total_pnl, 4),
        "r_multiple": round(r_mult, 4),
        "duration_hours": round((exit_ts - pos["entry_ts"]) / 3_600_000, 2),
        "swept_level": round(pos["swept_level"], 8) if pos["swept_level"] else None,
        "swept_wick": round(pos["swept_wick"], 8) if pos["swept_wick"] else None,
        "zone_top": round(pos["zone_top"], 8), "zone_bot": round(pos["zone_bot"], 8),
        "regime_factor": pos["regime"], "session": pos["session"],
        "funding_cost": round(pos["funding"], 4),
    }


def _process_exits(pos, hi, lo, cl, i, bar_ts, slippage, exec_cfg):
    """Check exits on this bar. SL checked before TP (conservative). Returns
    a finalized trade dict if fully closed this bar, else None."""
    side = pos["side"]
    if side == "long":
        # phase 1: before TP1 -> SL full, or TP1 partial
        if not pos["tp1_done"]:
            if lo <= pos["sl"]:
                px = pos["sl"] * (1 - slippage)
                pnl = _leg_pnl(pos, px, pos["remaining"], exec_cfg)
                return _finalize(pos, px, bar_ts, i, "SL", pnl)
            if hi >= pos["tp1"]:
                px = pos["tp1"] * (1 - slippage)
                pos["realized"] += _leg_pnl(pos, px, 0.5, exec_cfg)
                pos["remaining"] = 0.5
                pos["tp1_done"] = True
                pos["sl"] = pos["entry"]  # move to breakeven
                # same-bar TP2?
                if hi >= pos["tp2"]:
                    px2 = pos["tp2"] * (1 - slippage)
                    pnl = _leg_pnl(pos, px2, 0.5, exec_cfg)
                    return _finalize(pos, px2, bar_ts, i, "TP2", pnl)
            return None
        # phase 2: after TP1, SL at BE
        if lo <= pos["sl"]:
            px = pos["sl"] * (1 - slippage)
            pnl = _leg_pnl(pos, px, pos["remaining"], exec_cfg)
            return _finalize(pos, px, bar_ts, i, "SL_BE", pnl)
        if hi >= pos["tp2"]:
            px = pos["tp2"] * (1 - slippage)
            pnl = _leg_pnl(pos, px, pos["remaining"], exec_cfg)
            return _finalize(pos, px, bar_ts, i, "TP2", pnl)
        return None
    else:  # short
        if not pos["tp1_done"]:
            if hi >= pos["sl"]:
                px = pos["sl"] * (1 + slippage)
                pnl = _leg_pnl(pos, px, pos["remaining"], exec_cfg)
                return _finalize(pos, px, bar_ts, i, "SL", pnl)
            if lo <= pos["tp1"]:
                px = pos["tp1"] * (1 + slippage)
                pos["realized"] += _leg_pnl(pos, px, 0.5, exec_cfg)
                pos["remaining"] = 0.5
                pos["tp1_done"] = True
                pos["sl"] = pos["entry"]
                if lo <= pos["tp2"]:
                    px2 = pos["tp2"] * (1 + slippage)
                    pnl = _leg_pnl(pos, px2, 0.5, exec_cfg)
                    return _finalize(pos, px2, bar_ts, i, "TP2", pnl)
            return None
        if hi >= pos["sl"]:
            px = pos["sl"] * (1 + slippage)
            pnl = _leg_pnl(pos, px, pos["remaining"], exec_cfg)
            return _finalize(pos, px, bar_ts, i, "SL_BE", pnl)
        if lo <= pos["tp2"]:
            px = pos["tp2"] * (1 + slippage)
            pnl = _leg_pnl(pos, px, pos["remaining"], exec_cfg)
            return _finalize(pos, px, bar_ts, i, "TP2", pnl)
        return None


def _force_close(pos, cl, bar_ts, slippage, exec_cfg):
    side = pos["side"]
    px = cl * (1 - slippage) if side == "long" else cl * (1 + slippage)
    pnl = _leg_pnl(pos, px, pos["remaining"], exec_cfg)
    exit_type = "TP1" if pos["tp1_done"] else "EOD"
    return _finalize(pos, px, bar_ts, pos["entry_bar"], exit_type, pnl)
