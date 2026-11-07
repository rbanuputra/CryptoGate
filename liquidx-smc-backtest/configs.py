"""
LiquidX SMC Scalper — parameter configs, symbol list, and execution settings.

All tunables for the backtest live here so the engine stays symbol-agnostic.
"""

from copy import deepcopy

# --------------------------------------------------------------------------- #
# Strategy parameter configs
# --------------------------------------------------------------------------- #

DEFAULT = {
    "name": "default",
    "displacement_mult": 1.5,
    "sweep_wick_min": 0.3,
    "sl_buffer": 0.3,
    "tp1_rr": 1.5,
    "tp2_rr": 3.0,
    "cooldown_bars": 8,
    "choch_required": True,
    "zone_max_age": 50,
    "swing_len": 5,
    "sweep_lookback": 20,
    "vol_spike_mult": 1.2,
    "session_filter": True,
    "vol_filter": False,
    "auto_adapt": False,
    "ob_enabled": True,
    "fvg_enabled": True,
}

AGGRESSIVE = {
    **deepcopy(DEFAULT),
    "name": "aggressive",
    "displacement_mult": 1.2,
    "sweep_wick_min": 0.2,
    "tp2_rr": 4.0,
    "cooldown_bars": 5,
    "choch_required": False,
}

CONSERVATIVE = {
    **deepcopy(DEFAULT),
    "name": "conservative",
    "displacement_mult": 2.0,
    "sweep_wick_min": 0.5,
    "sl_buffer": 0.5,
    "cooldown_bars": 12,
    "zone_max_age": 40,
    "vol_spike_mult": 1.5,
    "fvg_enabled": False,  # OB only
}

ADAPTIVE = {
    **deepcopy(DEFAULT),
    "name": "adaptive",
    "choch_required": False,
    "auto_adapt": True,
}

CONFIGS = [DEFAULT, AGGRESSIVE, CONSERVATIVE, ADAPTIVE]
CONFIGS_BY_NAME = {c["name"]: c for c in CONFIGS}


# --------------------------------------------------------------------------- #
# Symbols (top CMC excluding stablecoins). Binance USDⓈ-M Futures tickers.
# --------------------------------------------------------------------------- #
# listing_hint: approximate earliest data; the fetcher clamps to Jan 2022
# when the symbol is older, else uses the listing date.

SYMBOLS = [
    {"symbol": "BTCUSDT", "display": "BTC", "tier": "major"},
    {"symbol": "ETHUSDT", "display": "ETH", "tier": "major"},
    {"symbol": "BNBUSDT", "display": "BNB", "tier": "mid"},
    {"symbol": "XRPUSDT", "display": "XRP", "tier": "mid"},
    {"symbol": "SOLUSDT", "display": "SOL", "tier": "mid"},
    {"symbol": "TRXUSDT", "display": "TRX", "tier": "low"},
    {"symbol": "ZECUSDT", "display": "ZEC", "tier": "low"},
    {"symbol": "HYPEUSDT", "display": "HYPE", "tier": "low"},
    {"symbol": "DOGEUSDT", "display": "DOGE", "tier": "meme"},
    {"symbol": "1000PEPEUSDT", "display": "PEPE", "tier": "meme"},
]

# Lower-liquidity coins get wider slippage.
HIGH_SLIPPAGE_TIERS = {"low", "meme"}


# --------------------------------------------------------------------------- #
# Timeframe combinations  (chart TF + HTF for liquidity levels)
# --------------------------------------------------------------------------- #

TF_COMBOS = [
    {"name": "15M+4H", "chart": "15m", "htf": "4h", "primary": True},
    {"name": "1H+4H", "chart": "1h", "htf": "4h", "primary": False},
    {"name": "4H+1D", "chart": "4h", "htf": "1d", "primary": False},
]

# all distinct timeframes we must fetch per symbol
FETCH_TIMEFRAMES = ["15m", "1h", "4h", "1d"]


# --------------------------------------------------------------------------- #
# Execution / cost model
# --------------------------------------------------------------------------- #

EXEC = {
    "start_equity": 10_000.0,
    "risk_pct": 0.02,               # 2% risk per trade
    "slippage_pct": 0.0002,         # 0.02% default
    "slippage_pct_high": 0.0005,    # 0.05% for low-liq / meme
    "taker_fee_pct": 0.0006,        # 0.06% per side
    "funding_pct": 0.0001,          # 0.01% per 8h window
    "funding_interval_h": 8,
    # drawdown risk scaling
    "dd_scale": [
        (0.15, 0.0),    # dd > 15% -> stop (handled: 0 size) until recover < 10%
        (0.10, 0.50),   # dd > 10% -> half size
        (0.05, 0.75),   # dd > 5%  -> 75% size
    ],
    "dd_resume_level": 0.10,        # resume trading when dd recovers below this
    "daily_loss_limit": 0.03,       # 3% of start-of-day equity
}

# Data history
DATA_START = "2022-01-01"


def slippage_for(tier: str) -> float:
    return EXEC["slippage_pct_high"] if tier in HIGH_SLIPPAGE_TIERS else EXEC["slippage_pct"]
