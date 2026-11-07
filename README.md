# CryptoGate — AI Multi-Strategy Trading Agent

Regime-aware, multi-strategy trading agent for **Binance Futures (USDⓈ-M)** with a
real-time Next.js dashboard. The agent dynamically screens coins, detects market
regime, and activates the most suitable strategies from a pool of 6.

> ⚠️ **Pivot in progress.** This repo previously held a Laravel fundamental-screening
> app. That code remains in git history (`git log`, commit `e5774c4` and earlier).
> The project is being rebuilt as a TypeScript monorepo per
> `liquidx-ai-agent-prd.md`.

## Status ✅ (43 tests passing · dashboard builds · 9 routes)

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

**Increment 6 — fills, journaling & notifications (Phase 4 + Module 9):**
- **User data stream** — `listenKey` lifecycle + socket, with a pure `parseUserDataMessage`
  decoder for `ORDER_TRADE_UPDATE` / `ACCOUNT_UPDATE`
- **Trade tracker** — fills drive the lifecycle: realize PnL, move SL→breakeven on TP1,
  record the closed Trade, update equity/drawdown, feed the risk circuit breaker
- **Module 9 Journal** — `Journal` port with `InMemoryJournal` + a `PrismaJournal`
  (inject a Postgres client); signals, trades, equity and regime are persisted
- **Notifications** — `Notifier` port with Telegram + console + fan-out, and trade-event
  templates (entry / TP1 / TP2 / SL / closed / circuit-breaker)

The agent backend is now functional end-to-end in paper mode (signal → risk → execute →
fill → journal + notify).

**Increment 7 — dashboard (Phase 6–7):**
- **Agent REST API** — `/api/status`, `/trades`, `/signals`, `/equity`, `/positions`,
  `/regime`, `/screener`, `/strategies`, `/config` (GET/PUT), `/agent/:action`
  (start/pause/stop/close_all), `/position/:symbol/close`; all served from live
  in-memory state, plus Socket.io push
- **Next.js dashboard** — dark-theme, nav + 6 pages: Overview (equity/positions/recent
  trades, live), Coin Screener, Trade Journal (filterable + summary), Strategy Monitor,
  Signal Log (live taken/rejected feed), Settings (controls + risk params + strategy
  toggles, hot-reloaded via `PUT /api/config`)
- Run-state (running/paused/stopped) + per-strategy toggles now gate live trading

**Increment 8 — charts, Backtest Lab & Prisma wiring:**
- **Charts page** — equity curve (Recharts AreaChart), drawdown chart, and colour-coded
  regime timeline (per-coin filter), all live-polling the agent
- **Backtest Lab page** — form-driven SMC Sweep backtest (symbol, TF, risk params) via
  `POST /api/backtest/run`; results show stats grid, equity curve, and full trade list
- **Prisma/Postgres wiring** — `getPrismaClient()` auto-detects `DATABASE_URL`; when
  Postgres is available the agent writes to both Prisma (persistent) and in-memory
  (dashboard) journals simultaneously. Without `DATABASE_URL` it falls back to
  in-memory only, zero-config
- **Dependencies** — Recharts 2.12 (web), @prisma/client 5.22 (agent)
- **Nav** — 8 links: Overview, Charts, Screener, Trades, Strategies, Signals, Backtest,
  Settings

Remaining: NextAuth login. See the PRD's phase plan.

## Run the dashboard
```bash
npm run dev -w @cryptogate/agent     # API+WS on :4000 (LIVE=1 to trade)
npm run dev -w @cryptogate/web        # dashboard on :3000
```

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
