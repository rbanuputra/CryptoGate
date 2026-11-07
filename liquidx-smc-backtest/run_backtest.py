"""
run_backtest.py — main entry point.

Loops: 4 configs × all symbols × primary TF (15M+4H) = base matrix,
then top-3 symbols × 3 TF combos for a timeframe comparison, plus a
parameter grid-search optimization on the best config.

Writes per-trade CSVs, equity CSVs, per-run summary JSONs, an aggregate
summary, and triggers the HTML report.

Run:  python run_backtest.py
      python run_backtest.py --symbols BTCUSDT ETHUSDT --quick
"""

import argparse
import csv
import itertools
import json
import os
from collections import defaultdict

import numpy as np
import pandas as pd

from configs import (CONFIGS, CONFIGS_BY_NAME, SYMBOLS, TF_COMBOS, EXEC,
                     slippage_for, DEFAULT)
from backtest_engine import run_backtest
import report_generator

BASE = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE, "data")
RESULTS_DIR = os.path.join(BASE, "results")

SYMBOL_META = {s["symbol"]: s for s in SYMBOLS}


# --------------------------------------------------------------------------- #
# Data loading
# --------------------------------------------------------------------------- #
def load_csv(symbol: str, tf: str):
    path = os.path.join(DATA_DIR, f"{symbol.lower()}_{tf}.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path)
    df = df.dropna().reset_index(drop=True)
    df["timestamp"] = df["timestamp"].astype("int64")
    return df


# --------------------------------------------------------------------------- #
# Stats
# --------------------------------------------------------------------------- #
def _group_stats(trades):
    wins = [t for t in trades if t["pnl_dollar"] > 0]
    gross_p = sum(t["pnl_dollar"] for t in wins)
    gross_l = -sum(t["pnl_dollar"] for t in trades if t["pnl_dollar"] < 0)
    pf = gross_p / gross_l if gross_l > 0 else (float("inf") if gross_p > 0 else 0.0)
    wr = len(wins) / len(trades) if trades else 0.0
    pnl = sum(t["pnl_dollar"] for t in trades)
    return {"trades": len(trades), "wr": round(wr, 4),
            "pf": round(pf, 3) if pf != float("inf") else 999.0,
            "pnl": round(pnl, 2)}


def compute_stats(result, symbol, config_name, tf_name):
    trades = result["trades"]
    curve = result["curve"]
    start_eq = result["start_equity"]
    n = len(trades)

    base = {
        "symbol": symbol, "config_name": config_name, "timeframe": tf_name,
        "total_trades": n, "win_rate": 0.0, "profit_factor": 0.0,
        "total_return_pct": round((result["final_equity"] / start_eq - 1) * 100, 2),
        "total_pnl": round(result["final_equity"] - start_eq, 2),
        "max_drawdown_pct": 0.0, "avg_rr": 0.0, "sharpe_ratio": 0.0,
        "sortino_ratio": 0.0, "avg_trade_duration_hours": 0.0,
        "max_consecutive_wins": 0, "max_consecutive_losses": 0,
        "setup_breakdown": {}, "direction_breakdown": {}, "exit_breakdown": {},
        "session_breakdown": {}, "monthly_breakdown": {}, "yearly_breakdown": {},
        "final_equity": round(result["final_equity"], 2),
    }
    if n == 0:
        return base

    g = _group_stats(trades)
    base["win_rate"] = g["wr"]
    base["profit_factor"] = g["pf"]
    base["avg_rr"] = round(np.mean([t["r_multiple"] for t in trades]), 4)
    base["avg_trade_duration_hours"] = round(np.mean([t["duration_hours"] for t in trades]), 2)

    # consecutive streaks
    mcw = mcl = cw = cl = 0
    for t in trades:
        if t["pnl_dollar"] > 0:
            cw += 1; cl = 0; mcw = max(mcw, cw)
        else:
            cl += 1; cw = 0; mcl = max(mcl, cl)
    base["max_consecutive_wins"] = mcw
    base["max_consecutive_losses"] = mcl

    # drawdown + sharpe/sortino from equity curve (daily)
    if curve:
        cdf = pd.DataFrame(curve, columns=["ts", "equity", "dd", "pos"])
        base["max_drawdown_pct"] = round(float(cdf["dd"].max()), 2)
        cdf["date"] = pd.to_datetime(cdf["ts"], unit="ms", utc=True).dt.date
        daily = cdf.groupby("date")["equity"].last()
        rets = daily.pct_change().dropna()
        if len(rets) > 2 and rets.std() > 0:
            base["sharpe_ratio"] = round(float(rets.mean() / rets.std() * np.sqrt(365)), 3)
            downside = rets[rets < 0]
            if len(downside) > 0 and downside.std() > 0:
                base["sortino_ratio"] = round(float(rets.mean() / downside.std() * np.sqrt(365)), 3)

    # breakdowns
    by_setup = defaultdict(list)
    by_dir = defaultdict(list)
    by_sess = defaultdict(list)
    exit_br = defaultdict(lambda: {"count": 0, "pnl": 0.0})
    by_month = defaultdict(list)
    by_year = defaultdict(list)
    for t in trades:
        by_setup[t["entry_type"]].append(t)
        by_dir[t["direction"]].append(t)
        sess = t["session"] if t["session"] in ("london", "new_york") else "off"
        by_sess[sess].append(t)
        exit_br[t["exit_type"]]["count"] += 1
        exit_br[t["exit_type"]]["pnl"] += t["pnl_dollar"]
        month = t["exit_time"][:7]
        year = t["exit_time"][:4]
        by_month[month].append(t)
        by_year[year].append(t)

    for st in ("OB", "FVG"):
        base["setup_breakdown"][st] = _group_stats(by_setup.get(st, []))
    for d in ("long", "short"):
        gs = _group_stats(by_dir.get(d, []))
        base["direction_breakdown"][d] = {"trades": gs["trades"], "wr": gs["wr"], "pnl": gs["pnl"]}
    for s in ("london", "new_york"):
        gs = _group_stats(by_sess.get(s, []))
        base["session_breakdown"][s] = {"trades": gs["trades"], "wr": gs["wr"], "pnl": gs["pnl"]}
    for et, v in exit_br.items():
        base["exit_breakdown"][et] = {"count": v["count"], "pnl": round(v["pnl"], 2)}
    for m in sorted(by_month):
        gs = _group_stats(by_month[m])
        base["monthly_breakdown"][m] = {"trades": gs["trades"], "wr": gs["wr"], "pnl": gs["pnl"]}
    for y in sorted(by_year):
        gs = _group_stats(by_year[y])
        base["yearly_breakdown"][y] = {"trades": gs["trades"], "wr": gs["wr"], "pnl": gs["pnl"]}

    return base


# --------------------------------------------------------------------------- #
# Writers
# --------------------------------------------------------------------------- #
TRADE_COLS = ["trade_id", "symbol", "config", "tf", "entry_time", "exit_time",
              "direction", "entry_type", "entry_price", "sl_price", "tp1_price",
              "tp2_price", "exit_price", "exit_type", "pnl_dollar", "r_multiple",
              "equity_after", "duration_hours", "swept_level", "swept_wick",
              "zone_top", "zone_bot", "regime_factor", "session", "funding_cost"]


def write_trades(symbol, config, trades):
    path = os.path.join(RESULTS_DIR, f"trades_{symbol.lower()}_{config}.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=TRADE_COLS, extrasaction="ignore")
        w.writeheader()
        for t in trades:
            w.writerow(t)


def write_equity(symbol, config, curve):
    path = os.path.join(RESULTS_DIR, f"equity_{symbol.lower()}_{config}.csv")
    with open(path, "w", newline="") as f:
        f.write("timestamp,equity,drawdown_pct,position\n")
        for ts, eq, dd, pos in curve:
            f.write(f"{ts},{eq},{dd},{pos}\n")


def write_summary(symbol, config, stats):
    path = os.path.join(RESULTS_DIR, f"summary_{symbol.lower()}_{config}.json")
    json.dump(stats, open(path, "w"), indent=2)


# --------------------------------------------------------------------------- #
# Single run
# --------------------------------------------------------------------------- #
def run_one(symbol, config, tf_combo, save=True):
    meta = SYMBOL_META.get(symbol, {"tier": "mid"})
    chart = load_csv(symbol, tf_combo["chart"])
    htf = load_csv(symbol, tf_combo["htf"])
    if chart is None or htf is None or len(chart) < 200 or len(htf) < 50:
        return None
    slip = slippage_for(meta["tier"])
    result = run_backtest(chart, htf, config, EXEC, slip, symbol,
                          tf_combo["name"], tf_combo["chart"], tf_combo["htf"])
    stats = compute_stats(result, symbol, config["name"], tf_combo["name"])
    if save:
        write_trades(symbol, config["name"], result["trades"])
        write_equity(symbol, config["name"], result["curve"])
        write_summary(symbol, config["name"], stats)
    return {"stats": stats, "result": result}


# --------------------------------------------------------------------------- #
# Optimization grid search
# --------------------------------------------------------------------------- #
def optimize(symbol, base_config, tf_combo):
    grid = {
        "displacement_mult": [1.0, 1.2, 1.5, 1.8, 2.0],
        "tp2_rr": [2.0, 3.0, 4.0, 5.0],
        "cooldown_bars": [3, 5, 8, 12],
        "choch_required": [True, False],
    }
    combos = list(itertools.product(*grid.values()))
    results = []
    chart = load_csv(symbol, tf_combo["chart"])
    htf = load_csv(symbol, tf_combo["htf"])
    if chart is None or htf is None:
        return []
    meta = SYMBOL_META.get(symbol, {"tier": "mid"})
    slip = slippage_for(meta["tier"])
    for vals in combos:
        cfg = dict(base_config)
        cfg.update(dict(zip(grid.keys(), vals)))
        cfg["name"] = "opt"
        res = run_backtest(chart, htf, cfg, EXEC, slip, symbol,
                           tf_combo["name"], tf_combo["chart"], tf_combo["htf"])
        st = compute_stats(res, symbol, "opt", tf_combo["name"])
        if st["total_trades"] >= 30:
            results.append({
                "params": dict(zip(grid.keys(), vals)),
                "profit_factor": st["profit_factor"], "win_rate": st["win_rate"],
                "total_return_pct": st["total_return_pct"], "trades": st["total_trades"],
            })
    results.sort(key=lambda r: r["profit_factor"], reverse=True)
    return results[:5]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", nargs="*", default=[s["symbol"] for s in SYMBOLS])
    ap.add_argument("--configs", nargs="*", default=[c["name"] for c in CONFIGS])
    ap.add_argument("--quick", action="store_true", help="primary TF only, skip optimization")
    ap.add_argument("--no-opt", action="store_true")
    args = ap.parse_args()

    os.makedirs(RESULTS_DIR, exist_ok=True)
    primary = next(t for t in TF_COMBOS if t["primary"])
    configs = [CONFIGS_BY_NAME[c] for c in args.configs]

    all_stats = []        # list of stats dicts (primary TF)
    equity_curves = {}    # (symbol,config) -> curve for report

    print("\n########## BASE MATRIX (primary TF 15M+4H) ##########")
    for symbol in args.symbols:
        for config in configs:
            run = run_one(symbol, config, primary)
            if run is None:
                print(f"  [skip] {symbol} {config['name']}: missing/short data")
                continue
            s = run["stats"]
            all_stats.append(s)
            equity_curves[(symbol, config["name"])] = run["result"]["curve"]
            print(f"  {symbol:14s} {config['name']:12s} "
                  f"trades={s['total_trades']:4d} WR={s['win_rate']*100:5.1f}% "
                  f"PF={s['profit_factor']:6.2f} ret={s['total_return_pct']:8.1f}% "
                  f"maxDD={s['max_drawdown_pct']:5.1f}%")

    # ---- pick best config overall (by median PF across symbols w/ >=30 trades)
    cfg_scores = defaultdict(list)
    for s in all_stats:
        if s["total_trades"] >= 30:
            cfg_scores[s["config_name"]].append(s["profit_factor"])
    best_config_name = DEFAULT["name"]
    if cfg_scores:
        best_config_name = max(cfg_scores, key=lambda k: np.median(cfg_scores[k]))
    print(f"\nBest config (median PF, >=30 trades): {best_config_name}")

    # ---- top-3 symbols by return under best config
    best_rows = [s for s in all_stats if s["config_name"] == best_config_name]
    best_rows.sort(key=lambda s: s["total_return_pct"], reverse=True)
    top3 = [s["symbol"] for s in best_rows[:3]]
    print(f"Top-3 symbols: {top3}")

    # ---- TF comparison: top-3 × 3 TF combos × best config
    tf_comparison = []
    best_cfg = CONFIGS_BY_NAME[best_config_name]
    print("\n########## TIMEFRAME COMPARISON (best config) ##########")
    for symbol in top3:
        for tf in TF_COMBOS:
            run = run_one(symbol, best_cfg, tf, save=False)
            if run is None:
                continue
            s = run["stats"]
            tf_comparison.append(s)
            print(f"  {symbol:14s} {tf['name']:8s} trades={s['total_trades']:4d} "
                  f"WR={s['win_rate']*100:5.1f}% PF={s['profit_factor']:6.2f} "
                  f"ret={s['total_return_pct']:8.1f}%")

    # ---- optimization on best config, per top-3 symbol
    optimization = {}
    if not args.quick and not args.no_opt:
        print("\n########## OPTIMIZATION GRID (best config base) ##########")
        for symbol in top3:
            top = optimize(symbol, best_cfg, primary)
            optimization[symbol] = top
            print(f"  {symbol}: {len(top)} combos >=30 trades")
            for r in top[:3]:
                print(f"     PF={r['profit_factor']:.2f} WR={r['win_rate']*100:.1f}% "
                      f"ret={r['total_return_pct']:.1f}% {r['params']}")

    # ---- aggregate summary
    aggregate = build_aggregate(all_stats, best_config_name, top3, tf_comparison,
                                optimization, equity_curves)
    json.dump(aggregate, open(os.path.join(RESULTS_DIR, "aggregate_summary.json"), "w"), indent=2)

    # ---- HTML report
    report_generator.generate(all_stats, tf_comparison, optimization,
                              equity_curves, aggregate, RESULTS_DIR)
    print(f"\n✅ Done. Report -> {os.path.join(RESULTS_DIR, 'report.html')}")


def build_aggregate(all_stats, best_config, top3, tf_comparison, optimization, curves):
    by_symbol = defaultdict(list)
    for s in all_stats:
        by_symbol[s["symbol"]].append(s)

    leaderboard = []
    for sym, rows in by_symbol.items():
        best = max(rows, key=lambda r: r["profit_factor"])
        leaderboard.append({
            "symbol": sym, "best_config": best["config_name"],
            "profit_factor": best["profit_factor"], "win_rate": best["win_rate"],
            "total_return_pct": best["total_return_pct"],
            "total_trades": best["total_trades"],
            "max_drawdown_pct": best["max_drawdown_pct"],
        })
    leaderboard.sort(key=lambda r: r["profit_factor"], reverse=True)

    # config win counts
    cfg_wins = defaultdict(int)
    for sym, rows in by_symbol.items():
        best = max(rows, key=lambda r: r["profit_factor"])
        cfg_wins[best["config_name"]] += 1

    # correlation of monthly pnl across symbols (best config)
    monthly = {}
    for s in all_stats:
        if s["config_name"] == best_config:
            series = {m: v["pnl"] for m, v in s["monthly_breakdown"].items()}
            monthly[s["symbol"]] = series
    corr = {}
    if len(monthly) >= 2:
        mdf = pd.DataFrame(monthly).fillna(0.0)
        if len(mdf) >= 3:
            corr = mdf.corr().round(3).to_dict()

    return {
        "best_config_overall": best_config,
        "config_win_counts": dict(cfg_wins),
        "top3_symbols": top3,
        "leaderboard": leaderboard,
        "tf_comparison": tf_comparison,
        "optimization": optimization,
        "monthly_correlation": corr,
    }


if __name__ == "__main__":
    main()
