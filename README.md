# CryptoGate — AI Multi-Strategy Trading Agent

Regime-aware, multi-strategy trading agent for **Binance Futures (USDⓈ-M)** with a
real-time Next.js dashboard. The agent dynamically screens coins, detects market
regime, and activates the most suitable strategies from a pool of 6.

> ⚠️ **Pivot in progress.** This repo previously held a Laravel fundamental-screening
> app. That code remains in git history (`git log`, commit `e5774c4` and earlier).
> The project is being rebuilt as a TypeScript monorepo per
> `liquidx-ai-agent-prd.md`.

## Status ✅ (36 tests passing)

**Increment 1 — foundation + first vertical slice:**
- **Monorepo** — Turborepo + npm workspaces (`packages/shared`, `apps/agent`, `apps/web`)
- **`@cryptogate/shared`** — types (candle/regime/strategy/trade/screener) + indicators
  (ATR, EMA, RSI, Bollinger, ADX, VWAP, pivots, SMA) + session/math utils, with unit tests
- **Agent** — Module 1 data feed (REST bootstrap + Binance kline WS), Module 3 regime
  detector (composite score), **Strategy 1: SMC Sweep** (ported from the validated
  Python backtest), a realistic backtest harness, and a minimal API + Socket.io server
- **Web** — dark-theme dashboard overview wired to the agent over REST + Socket.io
- **Infra** — Prisma schema (Postgres), docker-compose (Postgres/Redis/agent/web), `.env.example`

**Increment 2 — orchestrator brain:**
- **Module 2 Coin Screener** — Layer 1 universe filter, Layer 2 momentum scorer,
  Layer 3 pre-trade filter (all pure + unit-tested)
- **Module 5 Strategy Selector** — regime→strategy map, direction policies, composite
  signal scoring (weights, R:R bonus, multi-confirm, correlation/daily-loss penalties)
- **Module 6 Signal Aggregator** — runs active strategies, scores/filters/dedupes/ranks;
  wired into the agent loop on each 15M close

**Increment 3 — more strategies (Phase 3):**
- **Strategy 2: Momentum Breakout** — 4H key-level break on 15M with volume + ADX +
  body confirmation, aligned with the 4H EMA trend
- **Strategy 3: Mean Reversion** — fade Bollinger extremes with RSI + range-boundary +
  reversal-candle + exhaustion-volume confirmation (RANGING only)
- **Strategy 5: VWAP Bounce** — pullback-and-reject to session VWAP in the 4H trend,
  with chop/session guards

All four implemented strategies are registered in the agent loop; the aggregator now
has a real pool to rank and multi-confirm across.

**Increment 4 — risk + execution (Phase 4–5):**
- **Module 7 Risk Manager** — position sizing (20x / 25% margin risk with leverage cap),
  concurrency + one-per-symbol, correlation groups, drawdown size scaling, daily
  circuit breaker + consecutive-loss guard, spread + min-R:R gates, confidence sizing
- **Module 8 Execution Engine** — `ExchangeClient` abstraction with an in-memory
  `PaperExchangeClient` and a signed `BinanceFuturesClient` (live/testnet); bracket
  order placement (entry + SL + TP1 50% + TP2), and a `PositionManager` that moves SL
  to breakeven on TP1 and can emergency-close all
- Wired into the agent loop: aggregate → risk gate → execute (paper by default,
  live when `LIVE=1` + API keys)

**Increment 5 — order flow + strategies 4 & 6 (Phase 4):**
- **Module 1B Order Flow** — `OrderFlowStore` rolling windows (OI / funding / L/S ratio)
  + Binance REST fetchers, polled every 5 min in LIVE mode
- **Strategy 4: OI Divergence** — new price extreme while OI declines, confirmed by a
  funding or long/short extreme (reversal, wider stops)
- **Strategy 6: Liquidation Cascade Fade** — fade the first reversal after an OI-crash
  cascade shows exhaustion (RSI extreme + OI stabilising); half size
- Order flow threaded through the aggregator → all **6 strategies** now registered

Not yet built (next increments): user-data-stream fill detection + live equity/position
updates, journaling to Postgres (Module 9), Telegram alerts (Module 9), and dashboard
pages 2–7. See the PRD's phase plan.

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
