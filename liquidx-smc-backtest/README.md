# LiquidX SMC Scalper — Backtesting Engine

A from-scratch backtest engine for the **LiquidX Smart Money Concepts (SMC)**
scalping strategy: **Liquidity Sweep → Displacement → Order-Block / FVG retest**,
with multi-timeframe (HTF liquidity + LTF execution) analysis.

No external backtesting frameworks — pure `pandas` / `numpy` for full control
over the execution model.

## Strategy in one line
HTF swing pivots mark liquidity (BSL/SSL). On the chart TF the engine waits for a
**sweep** of that liquidity, a **displacement** candle, then an **OB or FVG
retest** in the swept direction (optionally confirmed by CHoCH/BOS structure,
session and volume filters) before entering on the **next bar's open**.

Exits: **TP1 at 1.5R** (close 50%, move SL to breakeven) → **TP2 at 3R** (close
the rest), or SL. Risk is 2% of equity per trade with drawdown scaling and a
daily loss circuit breaker.

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install pandas numpy requests
```

## How to run
```bash
# 1. Fetch OHLCV from Binance USDⓈ-M Futures (Bybit fallback), from 2022-01-01
python fetch_data.py
#    subset:  python fetch_data.py --symbols BTCUSDT ETHUSDT --tf 15m 4h

# 2. Run all backtests (4 configs × all symbols × primary TF, then TF compare + optimize)
python run_backtest.py
#    faster:  python run_backtest.py --quick          # primary TF, no grid search
#    subset:  python run_backtest.py --symbols BTCUSDT ETHUSDT

# 3. Open the report
open results/report.html
```

> **Network note:** `fetch_data.py` needs outbound access to `fapi.binance.com`
> (and `api.bybit.com` as fallback). Run it in an environment where that is
> allowed. If you only have CSVs, drop them in `data/` as
> `{symbol}_{tf}.csv` with header `timestamp,open,high,low,close,volume`
> (timestamp in epoch-milliseconds) and skip step 1.

## Files
| File | Purpose |
|------|---------|
| `configs.py` | Parameter configs (default/aggressive/conservative/adaptive), symbol list, TF combos, execution & cost model |
| `fetch_data.py` | Paginated OHLCV download + validation (gaps, OHLC sanity, de-dupe) |
| `backtest_engine.py` | Core symbol-agnostic engine (sweep/displacement/OB/FVG/structure + execution) |
| `run_backtest.py` | Orchestrator: base matrix, TF comparison, grid-search optimization, stats, aggregate |
| `report_generator.py` | Self-contained dark-theme HTML report (Chart.js) |
| `data/` | OHLCV CSVs + `fetch_log.json` |
| `results/` | `trades_*.csv`, `equity_*.csv`, `summary_*.json`, `aggregate_summary.json`, `report.html` |

## Configs
| Config | disp_mult | sweep_wick | sl_buf | tp2_rr | cooldown | choch | FVG | auto-adapt |
|--------|-----------|-----------|--------|--------|----------|-------|-----|-----------|
| default | 1.5 | 0.3 | 0.3 | 3.0 | 8 | ✓ | ✓ | – |
| aggressive | 1.2 | 0.2 | 0.3 | 4.0 | 5 | ✗ | ✓ | – |
| conservative | 2.0 | 0.5 | 0.5 | 3.0 | 12 | ✓ | ✗ (OB only) | – |
| adaptive | 1.5* | 0.3* | 0.3 | 3.0 | 8* | ✗ | ✓ | ✓ |

`*` adaptive values are scaled by `vol_regime = ATR / SMA(ATR,100)`, clamped to [0.7, 1.3].

## Execution model (realistic)
- Entry at **next bar open** (no look-ahead), slippage 0.02% (0.05% for low-liq/meme coins)
- Taker fee 0.06% per side (0.12% round trip)
- Funding 0.01% per 8h on open notional
- Max 1 position, $10k start, 2% risk/trade
- Drawdown scaling: >5% → 0.75× size, >10% → 0.5× size, >15% → halt until recovery <10%
- Daily circuit breaker: stop new entries after 3% day loss

## Output
- **Per-trade CSV** — full entry/exit/zone/sweep/session/funding detail
- **Equity curve CSV** — per-bar mark-to-market equity, drawdown, position
- **Summary JSON** — per symbol×config: WR, PF, return, Sharpe/Sortino, setup/direction/exit/session/monthly/yearly breakdowns
- **Aggregate JSON** — leaderboard, config win counts, top-3 symbols, monthly-PnL correlation matrix
- **HTML report** — leaderboard, per-symbol tabs (config head-to-head, overlaid equity curves, best-config breakdown), TF comparison, correlation heatmap, optimization table

## Optimization
Grid search on the best config: `displacement_mult × tp2_rr × cooldown_bars ×
choch_required` → top-5 combos by Profit Factor (min 30 trades), per top-3 symbol.

## Notes & caveats
- Engine mirrors the Pine indicator logic; structure (CHoCH/BOS) is a simplified
  pivot-based model — treat structure stats as directional, not exact.
- Statistical significance needs **30+ trades** per symbol/config; short-history
  symbols (HYPE, PEPE) are flagged in `fetch_log.json`.
- Backtest ≠ live. Costs are modeled but real fills, funding and liquidity vary.
