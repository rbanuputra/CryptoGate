<?php

namespace App\Services;

use App\Models\CompositeScore;
use App\Models\GateScore;
use App\Models\Token;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ScoringService
{
    private MomentumService $momentum;

    public function __construct(MomentumService $momentum)
    {
        $this->momentum = $momentum;
    }

    public function scoreToken(Token $token, ?string $runId = null): array
    {
        $runId = $runId ?? Str::uuid()->toString();
        $snapshot = $token->latestMarketSnapshot;

        if (!$snapshot) {
            return ['run_id' => $runId, 'error' => 'No market data'];
        }

        $defi = $token->latestDefiMetric;
        $holders = $token->latestHolderSnapshot;

        $gate1 = $this->scoreGate1($snapshot);
        $gate2 = $this->scoreGate2($snapshot, $defi);
        $gate3 = $this->scoreGate3($snapshot, $holders);

        foreach ([$gate1, $gate2, $gate3] as $gate) {
            GateScore::create([
                'token_id' => $token->id,
                'run_id' => $runId,
                'gate' => $gate['gate'],
                'score' => $gate['score'],
                'breakdown' => $gate['breakdown'],
                'data_completeness_pct' => $gate['completeness'],
            ]);
        }

        $weights = $this->getWeights();
        $rawComposite = round(
            $gate1['score'] * $weights['gate1']
            + $gate2['score'] * $weights['gate2']
            + $gate3['score'] * $weights['gate3'],
            2
        );

        $settings = $this->getSettings();
        $momentumMode = $settings['momentum_mode'] ?? 'off';
        $momentumScore = null;

        if ($momentumMode === 'on') {
            $mom = $this->momentum->calculateMomentum($token);
            $momentumScore = $mom['multiplier'];
            $composite = round(min(10, max(0, $rawComposite * $momentumScore)), 2);
        } else {
            $composite = $rawComposite;
        }

        $verdict = match (true) {
            $composite >= 7.0 => 'PASS',
            $composite >= 4.0 => 'WATCH',
            default => 'FAIL',
        };

        $totalCompleteness = ($gate1['completeness'] + $gate2['completeness'] + $gate3['completeness']) / 3;
        if ($totalCompleteness < 30) {
            $verdict = 'INCOMPLETE';
        }

        CompositeScore::create([
            'token_id' => $token->id,
            'run_id' => $runId,
            'composite_score' => $composite,
            'verdict' => $verdict,
            'weights' => $weights,
            'momentum_score' => $momentumScore,
            'momentum_mode' => $momentumMode,
        ]);

        return [
            'run_id' => $runId,
            'gate1' => $gate1['score'],
            'gate2' => $gate2['score'],
            'gate3' => $gate3['score'],
            'raw_composite' => $rawComposite,
            'composite_score' => $composite,
            'momentum_multiplier' => $momentumScore,
            'momentum_mode' => $momentumMode,
            'verdict' => $verdict,
        ];
    }

    /**
     * Gate 1: Tokenomics & Emissions
     * Evaluates supply structure and dilution risk.
     */
    private function scoreGate1(object $snapshot): array
    {
        $breakdown = [];
        $scores = [];
        $available = 0;
        $total = 4;

        $mc = (float) ($snapshot->market_cap ?? 0);
        $fdv = (float) ($snapshot->fdv ?? 0);
        $circ = (float) ($snapshot->circulating_supply ?? 0);
        $totalSupply = (float) ($snapshot->total_supply ?? 0);
        $maxSupply = (float) ($snapshot->max_supply ?? 0);

        // 1. MC/FDV Ratio (dilution risk)
        if ($mc > 0 && $fdv > 0) {
            $mcFdv = $mc / $fdv;
            $available++;
            // 1.0 = no dilution (best), < 0.1 = extreme dilution (worst)
            $s = match (true) {
                $mcFdv >= 0.9 => 10,
                $mcFdv >= 0.7 => 8,
                $mcFdv >= 0.5 => 6,
                $mcFdv >= 0.3 => 4,
                $mcFdv >= 0.1 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['mc_fdv_ratio'] = round($mcFdv, 4);
            $breakdown['mc_fdv_score'] = $s;
        }

        // 2. Circulating / Total Supply ratio
        if ($circ > 0 && $totalSupply > 0) {
            $circRatio = $circ / $totalSupply;
            $available++;
            $s = match (true) {
                $circRatio >= 0.9 => 10,
                $circRatio >= 0.75 => 8,
                $circRatio >= 0.5 => 6,
                $circRatio >= 0.3 => 4,
                $circRatio >= 0.1 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['circ_total_ratio'] = round($circRatio, 4);
            $breakdown['circ_total_score'] = $s;
        }

        // 3. Max Supply defined (deflationary signal)
        $available++;
        if ($maxSupply > 0) {
            $circMaxRatio = $circ > 0 ? $circ / $maxSupply : 0;
            $s = match (true) {
                $circMaxRatio >= 0.8 => 10,
                $circMaxRatio >= 0.6 => 8,
                $circMaxRatio >= 0.4 => 6,
                $circMaxRatio >= 0.2 => 4,
                default => 3,
            };
            $scores[] = $s;
            $breakdown['has_max_supply'] = true;
            $breakdown['circ_max_ratio'] = round($circMaxRatio, 4);
            $breakdown['max_supply_score'] = $s;
        } else {
            // No max supply = inflationary, neutral-low score
            $scores[] = 5;
            $breakdown['has_max_supply'] = false;
            $breakdown['max_supply_score'] = 5;
        }

        // 4. Supply concentration signal (total vs circ gap)
        if ($totalSupply > 0 && $circ > 0) {
            $locked = ($totalSupply - $circ) / $totalSupply;
            $available++;
            // High locked = more future sell pressure risk
            $s = match (true) {
                $locked <= 0.05 => 10,
                $locked <= 0.15 => 8,
                $locked <= 0.30 => 6,
                $locked <= 0.50 => 4,
                $locked <= 0.70 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['locked_pct'] = round($locked * 100, 2);
            $breakdown['locked_score'] = $s;
        }

        $score = count($scores) > 0 ? round(array_sum($scores) / count($scores), 2) : 0;
        $completeness = round(($available / $total) * 100, 2);

        return [
            'gate' => 1,
            'score' => $score,
            'breakdown' => $breakdown,
            'completeness' => $completeness,
        ];
    }

    /**
     * Gate 2: Valuation Metrics
     * Analyzes market cap tier, volume health, and FDV reasonableness.
     */
    private function scoreGate2(object $snapshot, ?object $defi = null): array
    {
        $breakdown = [];
        $scores = [];
        $available = 0;
        $total = 7;

        $mc = (float) ($snapshot->market_cap ?? 0);
        $fdv = (float) ($snapshot->fdv ?? 0);
        $volume = (float) ($snapshot->volume_24h ?? 0);

        // 1. Market Cap Tier
        if ($mc > 0) {
            $available++;
            $s = match (true) {
                $mc >= 10e9 => 10,
                $mc >= 1e9 => 8,
                $mc >= 100e6 => 6,
                $mc >= 10e6 => 4,
                $mc >= 1e6 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['market_cap'] = round($mc, 0);
            $breakdown['market_cap_tier_score'] = $s;
        }

        // 2. Volume / Market Cap ratio
        if ($mc > 0 && $volume > 0) {
            $volMc = $volume / $mc;
            $available++;
            $s = match (true) {
                $volMc >= 0.03 && $volMc <= 0.30 => 10,
                $volMc >= 0.01 && $volMc < 0.03 => 7,
                $volMc > 0.30 && $volMc <= 0.50 => 7,
                $volMc > 0.50 && $volMc <= 1.0 => 4,
                $volMc > 1.0 => 2,
                default => 3,
            };
            $scores[] = $s;
            $breakdown['vol_mc_ratio'] = round($volMc, 4);
            $breakdown['vol_mc_score'] = $s;
        }

        // 3. FDV reasonableness
        if ($fdv > 0 && $mc > 0) {
            $fdvMultiple = $fdv / $mc;
            $available++;
            $s = match (true) {
                $fdvMultiple <= 1.1 => 10,
                $fdvMultiple <= 1.5 => 8,
                $fdvMultiple <= 2.0 => 6,
                $fdvMultiple <= 5.0 => 4,
                $fdvMultiple <= 10.0 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['fdv_multiple'] = round($fdvMultiple, 2);
            $breakdown['fdv_score'] = $s;
        }

        // 4. Volume absolute tier
        if ($volume > 0) {
            $available++;
            $s = match (true) {
                $volume >= 100e6 => 10,
                $volume >= 10e6 => 8,
                $volume >= 1e6 => 6,
                $volume >= 100e3 => 4,
                $volume >= 10e3 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['volume_24h'] = round($volume, 0);
            $breakdown['volume_tier_score'] = $s;
        }

        // 5. Mcap/TVL ratio (DefiLlama)
        $tvl = (float) ($defi?->tvl ?? 0);
        if ($mc > 0 && $tvl > 0) {
            $mcapTvl = $mc / $tvl;
            $available++;
            $s = match (true) {
                $mcapTvl <= 1.0 => 10,
                $mcapTvl <= 2.0 => 8,
                $mcapTvl <= 5.0 => 6,
                $mcapTvl <= 10.0 => 4,
                $mcapTvl <= 50.0 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['tvl'] = round($tvl, 0);
            $breakdown['mcap_tvl_ratio'] = round($mcapTvl, 2);
            $breakdown['mcap_tvl_score'] = $s;
            $breakdown['has_defi_data'] = true;
        } else {
            $breakdown['has_defi_data'] = $tvl > 0;
        }

        // 6. P/S ratio (Mcap / annualized revenue)
        $revenue = (float) ($defi?->revenue_24h ?? 0);
        if ($mc > 0 && $revenue > 0) {
            $psRatio = $mc / ($revenue * 365);
            $available++;
            $s = match (true) {
                $psRatio <= 10 => 10,
                $psRatio <= 30 => 8,
                $psRatio <= 100 => 6,
                $psRatio <= 300 => 4,
                $psRatio <= 1000 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['revenue_24h'] = round($revenue, 0);
            $breakdown['ps_ratio'] = round($psRatio, 2);
            $breakdown['ps_ratio_score'] = $s;
        }

        // 7. P/F ratio (Mcap / annualized fees)
        $fees = (float) ($defi?->fees_24h ?? 0);
        if ($mc > 0 && $fees > 0) {
            $pfRatio = $mc / ($fees * 365);
            $available++;
            $s = match (true) {
                $pfRatio <= 5 => 10,
                $pfRatio <= 15 => 8,
                $pfRatio <= 50 => 6,
                $pfRatio <= 150 => 4,
                $pfRatio <= 500 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['fees_24h'] = round($fees, 0);
            $breakdown['pf_ratio'] = round($pfRatio, 2);
            $breakdown['pf_ratio_score'] = $s;
        }

        $score = count($scores) > 0 ? round(array_sum($scores) / count($scores), 2) : 0;
        $completeness = round(($available / $total) * 100, 2);

        return [
            'gate' => 2,
            'score' => $score,
            'breakdown' => $breakdown,
            'completeness' => $completeness,
        ];
    }

    /**
     * Gate 3: Manipulation Detection
     * Checks for wash trading signals, volume anomalies, and order book health.
     */
    private function scoreGate3(object $snapshot, ?object $holders = null): array
    {
        $breakdown = [];
        $scores = [];
        $available = 0;
        $total = 6;

        $mc = (float) ($snapshot->market_cap ?? 0);
        $volume = (float) ($snapshot->volume_24h ?? 0);
        $depthBid = (float) ($snapshot->depth_bid_2pct ?? 0);
        $depthAsk = (float) ($snapshot->depth_ask_2pct ?? 0);

        // 1. Wash Trading Signal (Volume/MC > 1.0 is suspicious)
        if ($mc > 0 && $volume > 0) {
            $volMc = $volume / $mc;
            $available++;
            $s = match (true) {
                $volMc <= 0.30 => 10,
                $volMc <= 0.50 => 8,
                $volMc <= 1.0 => 5,
                $volMc <= 2.0 => 3,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['wash_trade_ratio'] = round($volMc, 4);
            $breakdown['wash_trade_score'] = $s;
        }

        // 2. Order Book Depth (bid side)
        if ($depthBid > 0 && $mc > 0) {
            $depthRatio = $depthBid / $mc;
            $available++;
            $s = match (true) {
                $depthRatio >= 0.01 => 10,
                $depthRatio >= 0.005 => 8,
                $depthRatio >= 0.001 => 6,
                $depthRatio >= 0.0005 => 4,
                default => 2,
            };
            $scores[] = $s;
            $breakdown['depth_bid_ratio'] = round($depthRatio, 6);
            $breakdown['depth_bid_score'] = $s;
        }

        // 3. Order Book Depth (ask side)
        if ($depthAsk > 0 && $mc > 0) {
            $depthRatio = $depthAsk / $mc;
            $available++;
            $s = match (true) {
                $depthRatio >= 0.01 => 10,
                $depthRatio >= 0.005 => 8,
                $depthRatio >= 0.001 => 6,
                $depthRatio >= 0.0005 => 4,
                default => 2,
            };
            $scores[] = $s;
            $breakdown['depth_ask_ratio'] = round($depthRatio, 6);
            $breakdown['depth_ask_score'] = $s;
        }

        // 4. Bid-Ask Symmetry (healthy markets have balanced books)
        if ($depthBid > 0 && $depthAsk > 0) {
            $symmetry = min($depthBid, $depthAsk) / max($depthBid, $depthAsk);
            $available++;
            $s = match (true) {
                $symmetry >= 0.8 => 10,
                $symmetry >= 0.6 => 8,
                $symmetry >= 0.4 => 5,
                $symmetry >= 0.2 => 3,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['bid_ask_symmetry'] = round($symmetry, 4);
            $breakdown['symmetry_score'] = $s;
        }

        // If no depth data, use volume-based heuristic as fallback
        if ($depthBid == 0 && $depthAsk == 0 && $mc > 0 && $volume > 0) {
            // Volume consistency check: very low volume relative to MC = illiquid
            $volMc = $volume / $mc;
            $available++;
            $s = match (true) {
                $volMc >= 0.01 && $volMc <= 0.50 => 8,
                $volMc >= 0.005 => 6,
                $volMc > 0.50 => 4,
                default => 3,
            };
            $scores[] = $s;
            $breakdown['liquidity_proxy'] = round($volMc, 4);
            $breakdown['liquidity_proxy_score'] = $s;
            $breakdown['depth_data_available'] = false;
        } else {
            $breakdown['depth_data_available'] = $depthBid > 0 || $depthAsk > 0;
        }

        // 5. Top 10 holder concentration (Etherscan)
        $top10 = (float) ($holders?->top10_pct ?? 0);
        if ($top10 > 0) {
            $available++;
            $s = match (true) {
                $top10 <= 20 => 10,
                $top10 <= 35 => 8,
                $top10 <= 50 => 6,
                $top10 <= 70 => 4,
                $top10 <= 85 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['top10_holder_pct'] = $top10;
            $breakdown['top10_holder_score'] = $s;
            $breakdown['has_holder_data'] = true;
        } else {
            $breakdown['has_holder_data'] = false;
        }

        // 6. Top 50 holder concentration
        $top50 = (float) ($holders?->top50_pct ?? 0);
        if ($top50 > 0) {
            $available++;
            $s = match (true) {
                $top50 <= 40 => 10,
                $top50 <= 55 => 8,
                $top50 <= 70 => 6,
                $top50 <= 85 => 4,
                $top50 <= 95 => 2,
                default => 1,
            };
            $scores[] = $s;
            $breakdown['top50_holder_pct'] = $top50;
            $breakdown['top50_holder_score'] = $s;
        }

        $score = count($scores) > 0 ? round(array_sum($scores) / count($scores), 2) : 0;
        $completeness = round(($available / max($total, 1)) * 100, 2);

        return [
            'gate' => 3,
            'score' => $score,
            'breakdown' => $breakdown,
            'completeness' => $completeness,
        ];
    }

    private function getSettings(): array
    {
        $settingsFile = 'settings.json';
        if (Storage::disk('local')->exists($settingsFile)) {
            return json_decode(Storage::disk('local')->get($settingsFile), true) ?? [];
        }
        return [];
    }

    private function getWeights(): array
    {
        $settings = $this->getSettings();
        if (!empty($settings['weights'])) {
            return $settings['weights'];
        }

        return [
            'gate1' => 0.35,
            'gate2' => 0.40,
            'gate3' => 0.25,
        ];
    }
}
