<?php

namespace App\Services;

use App\Models\CompositeScore;
use App\Models\SectorMapping;
use App\Models\Token;
use Illuminate\Support\Facades\DB;

class MomentumService
{
    /**
     * Calculate sector momentum for a token based on its categories.
     * Returns a multiplier (0.8 - 1.2) that adjusts the composite score.
     */
    public function calculateMomentum(Token $token): array
    {
        $categories = $token->categories ?? [];
        if (empty($categories)) {
            return ['multiplier' => 1.0, 'sectors' => [], 'signal' => 'neutral'];
        }

        $sectorScores = [];

        $mappings = SectorMapping::whereIn('coingecko_category', $categories)->get();
        $narrativeSectors = $mappings->pluck('narrative_sector')->unique();

        foreach ($narrativeSectors as $sector) {
            $sectorCategories = SectorMapping::where('narrative_sector', $sector)
                ->pluck('coingecko_category')
                ->toArray();

            $sectorTokenIds = Token::where(function ($q) use ($sectorCategories) {
                foreach ($sectorCategories as $cat) {
                    $q->orWhereJsonContains('categories', $cat);
                }
            })->pluck('id');

            if ($sectorTokenIds->isEmpty()) continue;

            $avgScore = CompositeScore::whereIn('token_id', $sectorTokenIds)
                ->whereIn('id', function ($sub) {
                    $sub->selectRaw('MAX(id)')->from('composite_scores')->groupBy('token_id');
                })
                ->avg('composite_score');

            $tokenCount = $sectorTokenIds->count();
            $scoredCount = CompositeScore::whereIn('token_id', $sectorTokenIds)
                ->whereIn('id', function ($sub) {
                    $sub->selectRaw('MAX(id)')->from('composite_scores')->groupBy('token_id');
                })
                ->count();

            $passRate = 0;
            if ($scoredCount > 0) {
                $passCount = CompositeScore::whereIn('token_id', $sectorTokenIds)
                    ->whereIn('id', function ($sub) {
                        $sub->selectRaw('MAX(id)')->from('composite_scores')->groupBy('token_id');
                    })
                    ->where('verdict', 'PASS')
                    ->count();
                $passRate = round($passCount / $scoredCount * 100, 1);
            }

            $sectorScores[] = [
                'sector' => $sector,
                'avg_score' => round((float) $avgScore, 2),
                'token_count' => $tokenCount,
                'scored_count' => $scoredCount,
                'pass_rate' => $passRate,
            ];
        }

        if (empty($sectorScores)) {
            return ['multiplier' => 1.0, 'sectors' => [], 'signal' => 'neutral'];
        }

        $weightedAvg = collect($sectorScores)->avg('avg_score');

        // Momentum multiplier: sector avg score maps to 0.8 - 1.2
        $multiplier = match (true) {
            $weightedAvg >= 8.0 => 1.15,
            $weightedAvg >= 7.0 => 1.10,
            $weightedAvg >= 6.0 => 1.05,
            $weightedAvg >= 5.0 => 1.00,
            $weightedAvg >= 4.0 => 0.95,
            $weightedAvg >= 3.0 => 0.90,
            default => 0.85,
        };

        $signal = match (true) {
            $multiplier >= 1.10 => 'strong_bullish',
            $multiplier >= 1.05 => 'bullish',
            $multiplier >= 0.95 => 'neutral',
            $multiplier >= 0.90 => 'bearish',
            default => 'strong_bearish',
        };

        return [
            'multiplier' => $multiplier,
            'sectors' => $sectorScores,
            'sector_avg_score' => round($weightedAvg, 2),
            'signal' => $signal,
        ];
    }

    /**
     * Get sector overview — all sectors with their performance stats.
     */
    public function getSectorOverview(): array
    {
        $sectors = SectorMapping::select('narrative_sector')
            ->distinct()
            ->orderBy('narrative_sector')
            ->pluck('narrative_sector');

        $overview = [];

        foreach ($sectors as $sector) {
            $categories = SectorMapping::where('narrative_sector', $sector)
                ->pluck('coingecko_category')
                ->toArray();

            $tokenIds = Token::where(function ($q) use ($categories) {
                foreach ($categories as $cat) {
                    $q->orWhereJsonContains('categories', $cat);
                }
            })->pluck('id');

            if ($tokenIds->isEmpty()) continue;

            $latestScores = CompositeScore::whereIn('token_id', $tokenIds)
                ->whereIn('id', function ($sub) {
                    $sub->selectRaw('MAX(id)')->from('composite_scores')->groupBy('token_id');
                })
                ->get();

            $avgScore = $latestScores->avg('composite_score');
            $passCount = $latestScores->where('verdict', 'PASS')->count();
            $watchCount = $latestScores->where('verdict', 'WATCH')->count();
            $failCount = $latestScores->where('verdict', 'FAIL')->count();

            $overview[] = [
                'sector' => $sector,
                'token_count' => $tokenIds->count(),
                'scored_count' => $latestScores->count(),
                'avg_score' => round((float) $avgScore, 2),
                'pass' => $passCount,
                'watch' => $watchCount,
                'fail' => $failCount,
                'pass_rate' => $latestScores->count() > 0 ? round($passCount / $latestScores->count() * 100, 1) : 0,
            ];
        }

        usort($overview, fn ($a, $b) => $b['avg_score'] <=> $a['avg_score']);

        return $overview;
    }
}
