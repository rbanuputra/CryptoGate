# CryptoGate — Progress Tracker

> Last updated: 2026-10-13

## Status Legend

- ✅ Done — Implemented and functional
- 🔲 Scaffolded — File exists but empty/placeholder, no real logic
- ❌ Not Started — File/directory doesn't exist yet

---

## Phase 1: Foundation (Minggu 1–2)

### Database Layer ✅

| Item | Status | Notes |
|------|--------|-------|
| Migration: `tokens` | ✅ | All columns per PRD including description_en/id, translation_source, socials |
| Migration: `market_snapshots` | ✅ | FK to tokens, unique [token_id, date], all market data columns |
| Migration: `defi_metrics` | ✅ | FK to tokens, tvl, fees_24h, revenue_24h, tvl_breakdown JSON |
| Migration: `holder_snapshots` | ✅ | FK to tokens, top10/50 pct, total_holders, growth |
| Migration: `unlock_schedules` | ✅ | FK to tokens, category enum, is_cliff, amount_usd |
| Migration: `gate_scores` | ✅ | FK to tokens, run_id UUID, gate tinyint, breakdown JSON |
| Migration: `composite_scores` | ✅ | FK to tokens, verdict enum, momentum fields |
| Migration: `api_cache` | ✅ | cache_key unique, provider, status enum, expires_at |
| Migration: `manual_inputs` | ✅ | FK to tokens, unique [token_id, field_name] |
| Migration: `sector_mappings` | ✅ | narrative_sector + coingecko_category, unique composite |
| Migration: `watchlists` | ✅ | name, description |
| Migration: `watchlist_tokens` | ✅ | Pivot table, FK cascade, unique [watchlist_id, token_id] |
| Migration: `personal_access_tokens` | ✅ | Standard Sanctum |

### Eloquent Models ✅

| Model | Status | Notes |
|-------|--------|-------|
| Token | ✅ | 14 fillable, categories cast to array, all hasMany relations, latestMarketSnapshot/latestCompositeScore helpers |
| MarketSnapshot | ✅ | belongsTo token, date cast |
| DefiMetric | ✅ | belongsTo token, tvl_breakdown cast to array |
| GateScore | ✅ | belongsTo token, breakdown cast to array |
| HolderSnapshot | ✅ | belongsTo token |
| UnlockSchedule | ✅ | belongsTo token, is_cliff cast to boolean |
| ApiCache | ✅ | response cast to array, isExpired() helper |
| CompositeScore | ✅ | belongsTo token, weights cast to array, gateScores() query method |
| ManualInput | ✅ | belongsTo token |
| SectorMapping | ✅ | narrative_sector, coingecko_category |
| Watchlist | ✅ | belongsToMany tokens via pivot |
| WatchlistToken | ✅ | belongsTo watchlist + token |

### Contracts ✅

| Item | Status | Notes |
|------|--------|-------|
| ScoringGateInterface | ✅ | Defines score(), getGateNumber(), getGateName() — no implementations yet |

### Routes ✅

| Item | Status | Notes |
|------|--------|-------|
| api.php routes defined | ✅ | 20 routes — all mapped to implemented controller methods |

### Controllers ✅

| Controller | Status | Notes |
|------------|--------|-------|
| TokenController | ✅ | CRUD, searchCoinGecko, scores, refreshMarketData — all implemented |
| WatchlistController | ✅ | CRUD + addToken/removeToken — all implemented |
| ScreeningController | ✅ | run (fetches market data per token), status — scoring engine placeholder |
| SettingsController | ✅ | getWeights, updateWeights (file-based), getSectors — all implemented |

### Backend Services ✅ (partial)

| Item | Status | Notes |
|------|--------|-------|
| app/Services/ directory | ✅ | Created |
| ApiCacheService | ✅ | get/put/putError with TTL, wraps ApiCache model |
| CoinGeckoService | ✅ | search, getCoinDetail, getMarketData, getCategories, retry/backoff, cache integration |
| DefiLlama API client | ❌ | Not started (Phase 3) |
| Etherscan API client | ❌ | Not started (Phase 4) |
| app/Jobs/ directory | ❌ | Not started (async screening, Phase 5) |

### Config ✅

| Item | Status | Notes |
|------|--------|-------|
| services.php crypto APIs | ✅ | CoinGecko, DefiLlama, Etherscan config added |
| .env crypto API keys | ✅ | COINGECKO_API_KEY, COINGECKO_CACHE_TTL, ETHERSCAN_API_KEY |
| Database | ✅ | PostgreSQL 18.6, database `cryptogate` |

### Seeders ✅

| Item | Status | Notes |
|------|--------|-------|
| DatabaseSeeder | ✅ | Creates test user + calls SectorMappingSeeder |
| SectorMappingSeeder | ✅ | 74 mappings across 18 narrative sectors from PRD |

### Frontend Foundation ✅

| Item | Status | Notes |
|------|--------|-------|
| Project setup (Vite + React 19 + Tailwind 4) | ✅ | Properly configured |
| Dependencies (axios, recharts, react-router-dom, lucide-react) | ✅ | All installed |
| Routing (App.jsx) | ✅ | 5 routes with nested Layout |
| Layout component | ✅ | Dark theme, nav bar, active states, CryptoGate branding |
| Dummy data (data/dummy.js) | ✅ | 6 tokens, 3 watchlists, sectors, weights, format helpers |
| API service (api.js) | 🔲 | Bare axios instance — endpoint wrappers pending (integration phase) |

### Frontend Pages ✅ (UI slicing, dummy data)

| Page | Status | Notes |
|------|--------|-------|
| Dashboard | ✅ | Stat cards (total/pass/watch/fail), search bar, chain+verdict filters, TokenTable |
| Watchlist | ✅ | Sidebar list, create form, detail panel, token search+add UI, remove button |
| TokenDetail | ✅ | Header (logo, name, chain, categories, verdict badge), description toggle ID/EN, user notes, 6 metric cards, 4 tabs (Overview/Tokenomics/Valuation/Manipulation) |
| TokenDetail — Overview tab | ✅ | 3 GateScoreCards with breakdown |
| TokenDetail — Tokenomics tab | ✅ | Supply cards, UnlockTimeline bar chart (Recharts), Gate 1 score card |
| TokenDetail — Valuation tab | ✅ | Revenue & Fees line chart (Recharts), Gate 2 score card |
| TokenDetail — Manipulation tab | ✅ | Holder distribution pie chart (Recharts), Red flags list, Gate 3 score card |
| Screening | ✅ | Watchlist selector, Run button, animated progress bar, results list with status icons |
| Settings | ✅ | Gate weight sliders with sum validation, momentum mode radio, API key inputs, sector mappings grid |

### Frontend Components ✅ (partial)

| Component | Status | Notes |
|-----------|--------|-------|
| TokenTable | ✅ | Sortable columns (name, price, mcap, volume, G1/G2/G3, score, verdict), clickable rows |
| GateScoreCard | ✅ | Score with color coding, progress bar, breakdown metrics |
| VerdictBadge | ✅ | PASS/WATCH/FAIL/INCOMPLETE with colors, sm/lg sizes |
| ManualInputForm | ❌ | Not started |
| ScreeningProgress | ✅ | Built into Screening page (animated progress bar + status text) |

---

## Phase 2: Gate 1 — Tokenomics (Minggu 3–4) ❌

| Item | Status |
|------|--------|
| Tokenomist API integration | ❌ |
| TokenomicsGate scoring class | ❌ |
| MC/FDV ratio calculation | ❌ |
| Emission to revenue calc | ❌ |
| Unlock pressure calc | ❌ |
| UI: Tokenomics tab | ❌ |
| UI: UnlockTimeline chart | ❌ |
| UI: GateScoreCard for Gate 1 | ❌ |

## Phase 3: Gate 2 — Valuation (Minggu 5–6) ❌

| Item | Status |
|------|--------|
| DefiLlama integration | ❌ |
| ValuationGate scoring class | ❌ |
| P/S, P/F, Mcap/TVL calculation | ❌ |
| Sector benchmark (median P/S) | ❌ |
| UI: Valuation tab | ❌ |
| UI: RevenueChart | ❌ |
| UI: Peer comparison | ❌ |

## Phase 4: Gate 3 — Manipulasi (Minggu 7–8) ❌

| Item | Status |
|------|--------|
| Etherscan integration | ❌ |
| ManipulationGate scoring class | ❌ |
| Top 10 holder concentration | ❌ |
| Volume/depth ratio | ❌ |
| UI: Manipulation tab | ❌ |
| UI: HolderPieChart | ❌ |
| UI: Red flag badges | ❌ |

## Phase 5: Composite & Dashboard (Minggu 9–10) ❌

| Item | Status |
|------|--------|
| Composite scoring engine | ❌ |
| Verdict logic (PASS/WATCH/FAIL/INCOMPLETE) | ❌ |
| Dashboard ranked list | ❌ |
| Screening run trigger + progress | ❌ |
| Settings: gate weight customization | ❌ |
| Override verdict + notes | ❌ |

## Phase 6: Polish & v2 (Minggu 11+) ❌

| Item | Status |
|------|--------|
| Auto-refresh scheduler | ❌ |
| Coinglass integration | ❌ |
| CSV export | ❌ |
| Historical scoring comparison | ❌ |
| Unlock cliff notifications | ❌ |
| Bonus: Narrative/Sector Momentum | ❌ |

---

## Overall Progress Summary

| Layer | Completion |
|-------|------------|
| Database schema (migrations) | **100%** |
| Eloquent models | **100%** |
| Backend API logic (controllers, services, jobs) | **~70%** (Phase 1 complete, jobs pending) |
| Scoring engine (3 gates + composite) | **0%** (Phase 2-5) |
| External API integrations | **~35%** (CoinGecko done, DefiLlama/Etherscan pending) |
| Frontend routing + layout | **100%** |
| Frontend pages (UI slicing) | **~90%** (all 5 pages built with dummy data) |
| Frontend components (charts, tables) | **~75%** (TokenTable, GateScoreCard, VerdictBadge, charts done) |
| Frontend ↔ Backend integration | **0%** (pages use dummy data, not API) |

**Overall estimate: Phase 1 backend + frontend slicing complete. Integration next.**

### What to Build Next

1. **Frontend ↔ Backend integration** — Replace dummy data with real API calls in `api.js`
2. **Phase 2** — Gate 1 scoring engine (TokenomicsGate class) + Tokenomist API
3. **Phase 3** — Gate 2 scoring engine (ValuationGate class) + DefiLlama integration
4. **Phase 4** — Gate 3 scoring engine (ManipulationGate class) + Etherscan integration
5. **Phase 5** — Composite scoring, verdict logic, bulk screening with queue jobs
