# CryptoGate

Automated crypto fundamental screening dashboard. Evaluates 500+ tokens across tokenomics, valuation, and manipulation detection using a 3-gate scoring engine.

## Features

### Scoring Engine
- **Gate 1 — Tokenomics & Emissions (35%)**: MC/FDV ratio, circulating/total supply, max supply, locked token percentage
- **Gate 2 — Valuation Metrics (40%)**: Market cap tier, volume/MC ratio, FDV multiple, Mcap/TVL, P/S ratio, P/F ratio
- **Gate 3 — Manipulation Detection (25%)**: Wash trading signal, order book depth, bid-ask symmetry, top holder concentration
- **Verdict**: PASS (≥7.0) / WATCH (4.0–6.9) / FAIL (<4.0) / INCOMPLETE (<30% data)
- Configurable gate weights via Settings

### Dashboard Analytics
- Verdict distribution pie chart
- Market cap tier breakdown
- Score distribution histogram
- Sector performance ranking (top 15 by avg score)
- Top scorers and top volume tokens

### Token Detail
- **Summary Tab**: Auto-generated analysis — strengths, weaknesses, red flags in Bahasa Indonesia
- **Score History**: Composite & gate score trend charts over time
- **Valuation**: DeFi metrics from DefiLlama (TVL, fees, revenue, Mcap/TVL, P/S, P/F)
- **Manipulation**: Holder concentration from Ethplorer (top 10/50 holder %, address breakdown)
- **Momentum**: Sector momentum multiplier (0.85x–1.15x) based on narrative sector performance
- **Investment Plan**: DCA/lump-sum planning with price zones
- Add to watchlist directly from token detail

### Other Features
- Token discovery from CoinGecko trending categories
- Watchlists with notes
- Bulk screening (per watchlist or custom selection)
- Price alerts with configurable conditions
- Narrative sector mapping for peer comparison
- Client-side pagination (10/50/100) with sortable columns

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite 8, Tailwind CSS 4, shadcn/ui, Recharts |
| Backend | Laravel 12, PHP 8.2+ |
| Database | PostgreSQL |
| APIs | CoinGecko, DefiLlama, Ethplorer |

## Setup

### Prerequisites
- PHP 8.2+
- Composer
- Node.js 20+
- PostgreSQL

### Backend

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan db:seed   # seeds sector mappings
```

Configure API keys in `.env`:
```
COINGECKO_API_KEY=your_key
ETHERSCAN_API_KEY=your_key
```

### Frontend

```bash
cd frontend
npm install
```

### Running

```bash
# Terminal 1 — Backend
cd backend
php artisan serve

# Terminal 2 — Frontend
cd frontend
npm run dev
```

App runs at `http://localhost:3002` (Vite proxies API calls to Laravel).

### Scheduler (auto-refresh market data)

```bash
crontab -e
# Add:
* * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
```

## API Endpoints

### Tokens
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tokens` | List all tokens (paginated) |
| POST | `/api/tokens` | Add token by CoinGecko ID |
| GET | `/api/tokens/{id}` | Token detail with scores |
| POST | `/api/tokens/{id}/score` | Run scoring |
| POST | `/api/tokens/{id}/refresh` | Refresh market data |
| GET | `/api/tokens/{id}/score-history` | Score history over time |
| POST | `/api/tokens/{id}/fetch-defi` | Fetch DeFi metrics |
| POST | `/api/tokens/{id}/fetch-holders` | Fetch holder data |
| GET | `/api/tokens/{id}/momentum` | Sector momentum |
| GET | `/api/tokens/{id}/buy-zone` | Buy zone calculation |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview` | Dashboard analytics |
| GET | `/api/analytics/sector-momentum` | Sector momentum overview |

### Watchlists
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watchlists` | List watchlists |
| POST | `/api/watchlists` | Create watchlist |
| POST | `/api/watchlists/{id}/tokens` | Add token to watchlist |

### Screening
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/screening/run` | Run bulk screening |
| GET | `/api/screening/status/{runId}` | Check screening status |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/discover/run` | Discover trending tokens |
| GET/PUT | `/api/settings/weights` | Gate weights & momentum config |
| GET | `/api/sectors` | Sector mappings |
| GET/POST | `/api/alerts` | Price alerts |

## Scoring Breakdown

```
Composite Score = (G1 × W1) + (G2 × W2) + (G3 × W3)

Default weights: G1=35%, G2=40%, G3=25%

If momentum mode ON:
  Final Score = Composite × Momentum Multiplier (0.85–1.15)
```

Each metric scores 0–10. Gate score = average of available metrics.

### Verdict Thresholds
| Score | Verdict | Action |
|-------|---------|--------|
| 7.0–10.0 | PASS | Layak dipertimbangkan |
| 4.0–6.9 | WATCH | Monitor, tunggu perbaikan |
| 0.0–3.9 | FAIL | Hindari, risiko tinggi |

## Project Structure

```
backend/
├── app/
│   ├── Http/Controllers/    # API controllers
│   ├── Models/              # Eloquent models
│   └── Services/            # Business logic
│       ├── ScoringService        # 3-gate scoring engine
│       ├── CoinGeckoService      # Market data
│       ├── DefiLlamaService      # TVL, fees, revenue
│       ├── EtherscanService      # Holder concentration
│       ├── MomentumService       # Sector momentum
│       └── BuyZoneService        # Buy zone calculation
├── database/migrations/
└── routes/api.php

frontend/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   └── tokens/          # Token-specific components
│   ├── pages/
│   │   ├── Dashboard.jsx    # Analytics + token list
│   │   ├── TokenDetail.jsx  # Full token analysis
│   │   ├── Watchlist.jsx
│   │   ├── Screening.jsx
│   │   ├── Alerts.jsx
│   │   └── Settings.jsx
│   └── lib/
│       ├── api.js           # API client
│       └── format.js        # Number formatting
└── vite.config.js
```

## License

Private project.
