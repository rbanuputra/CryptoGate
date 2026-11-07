# CryptoGate — AI Multi-Strategy Trading Agent

Regime-aware, multi-strategy trading agent for **Binance Futures (USDⓈ-M)** with a
real-time Next.js dashboard. The agent dynamically screens coins, detects market
regime, and activates the most suitable strategies from a pool of 6.

> ⚠️ **Pivot in progress.** This repo previously held a Laravel fundamental-screening
> app. That code remains in git history (`git log`, commit `e5774c4` and earlier).
> The project is being rebuilt as a TypeScript monorepo per
> `liquidx-ai-agent-prd.md`.

## Status — Increment 1 (foundation + first vertical slice) ✅

Built and tested so far:

- **Monorepo** — Turborepo + npm workspaces (`packages/shared`, `apps/agent`, `apps/web`)
- **`@cryptogate/shared`** — types (candle/regime/strategy/trade/screener) + indicators
  (ATR, EMA, RSI, Bollinger, ADX, VWAP, pivots, SMA) + session/math utils, with unit tests
- **Agent** — Module 1 data feed (REST bootstrap + Binance kline WS), Module 3 regime
  detector (composite score), **Strategy 1: SMC Sweep** (ported from the validated
  Python backtest), a realistic backtest harness, and a minimal API + Socket.io server
- **Web** — dark-theme dashboard overview wired to the agent over REST + Socket.io
- **Infra** — Prisma schema (Postgres), docker-compose (Postgres/Redis/agent/web), `.env.example`

Not yet built (next increments): strategies 2–6, coin screener (Module 2),
strategy selector/aggregator, risk manager, execution engine, SQLite/Postgres
journaling, Telegram, and dashboard pages 2–7. See the PRD's phase plan.

## Layout
```
packages/shared     # shared types + indicator library (reused by agent & web)
apps/agent          # trading agent: data feed, regime, strategies, backtest, API/WS server
apps/web            # Next.js dashboard
```

## Quickstart
```bash
npm install                      # installs all workspaces

# run the full test suite (indicators + SMC strategy + backtest)
npm test

# backtest SMC on a symbol (needs outbound access to fapi.binance.com)
npm run backtest -w @cryptogate/agent -- --symbol BTCUSDT --chart 15m --htf 4h
#   offline:  ... -- --chart-csv chart.csv --htf-csv htf.csv --htf 4h

# run the agent (IDLE by default; LIVE=1 connects the Binance feed)
npm run dev -w @cryptogate/agent

# run the dashboard
npm run dev -w @cryptogate/web      # http://localhost:3000
```

## Trading parameters (per PRD)
20x leverage · 25% margin risk/trade · min R:R 1:2 · max 3 concurrent positions ·
1–5 trades/day · 50% daily-loss circuit breaker.

## Safety
High-risk system. Always start on **testnet** (`BINANCE_TESTNET=true`), then small
capital. The circuit breaker and drawdown scaling are critical safety nets. Past
backtest results do not guarantee future performance.
