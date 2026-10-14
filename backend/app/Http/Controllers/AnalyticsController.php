<?php

namespace App\Http\Controllers;

use App\Models\Token;
use App\Services\MomentumService;
use Illuminate\Http\JsonResponse;

class AnalyticsController extends Controller
{
    public function __construct(private MomentumService $momentum) {}

    public function overview(): JsonResponse
    {
        $tokens = Token::with(['latestMarketSnapshot', 'latestCompositeScore'])->get();

        $verdictDist = $tokens->groupBy(fn ($t) => $t->latestCompositeScore?->verdict ?? 'UNSCORED')
            ->map->count();

        $categoryStats = [];
        foreach ($tokens as $token) {
            $cats = $token->categories ?? [];
            $score = $token->latestCompositeScore;
            $snap = $token->latestMarketSnapshot;
            foreach ($cats as $cat) {
                if (!isset($categoryStats[$cat])) {
                    $categoryStats[$cat] = ['count' => 0, 'total_score' => 0, 'scored' => 0, 'total_mcap' => 0];
                }
                $categoryStats[$cat]['count']++;
                if ($score) {
                    $categoryStats[$cat]['total_score'] += (float) $score->composite_score;
                    $categoryStats[$cat]['scored']++;
                }
                if ($snap) {
                    $categoryStats[$cat]['total_mcap'] += (float) $snap->market_cap;
                }
            }
        }

        $sectorPerformance = collect($categoryStats)
            ->filter(fn ($s) => $s['count'] >= 2 && $s['scored'] >= 2)
            ->map(fn ($s, $name) => [
                'name' => $name,
                'count' => $s['count'],
                'avg_score' => round($s['total_score'] / max($s['scored'], 1), 2),
                'total_mcap' => $s['total_mcap'],
            ])
            ->sortByDesc('avg_score')
            ->values()
            ->take(15);

        $topByScore = $tokens
            ->filter(fn ($t) => $t->latestCompositeScore && (float) $t->latestCompositeScore->composite_score >= 7)
            ->sortByDesc(fn ($t) => (float) $t->latestCompositeScore->composite_score)
            ->take(10)
            ->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'symbol' => $t->symbol,
                'logo_url' => $t->logo_url,
                'score' => (float) $t->latestCompositeScore->composite_score,
                'verdict' => $t->latestCompositeScore->verdict,
                'market_cap' => (float) ($t->latestMarketSnapshot?->market_cap ?? 0),
                'price' => (float) ($t->latestMarketSnapshot?->price ?? 0),
            ])
            ->values();

        $topByVolume = $tokens
            ->filter(fn ($t) => $t->latestMarketSnapshot && (float) $t->latestMarketSnapshot->volume_24h > 0)
            ->sortByDesc(fn ($t) => (float) $t->latestMarketSnapshot->volume_24h)
            ->take(10)
            ->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'symbol' => $t->symbol,
                'logo_url' => $t->logo_url,
                'volume_24h' => (float) $t->latestMarketSnapshot->volume_24h,
                'market_cap' => (float) ($t->latestMarketSnapshot?->market_cap ?? 0),
                'price' => (float) ($t->latestMarketSnapshot?->price ?? 0),
                'score' => $t->latestCompositeScore ? (float) $t->latestCompositeScore->composite_score : null,
                'verdict' => $t->latestCompositeScore?->verdict,
            ])
            ->values();

        $mcapTiers = [
            'Large Cap (>$10B)' => 0,
            'Mid Cap ($1B-$10B)' => 0,
            'Small Cap ($100M-$1B)' => 0,
            'Micro Cap (<$100M)' => 0,
        ];
        foreach ($tokens as $t) {
            $mc = (float) ($t->latestMarketSnapshot?->market_cap ?? 0);
            if ($mc >= 10_000_000_000) $mcapTiers['Large Cap (>$10B)']++;
            elseif ($mc >= 1_000_000_000) $mcapTiers['Mid Cap ($1B-$10B)']++;
            elseif ($mc >= 100_000_000) $mcapTiers['Small Cap ($100M-$1B)']++;
            elseif ($mc > 0) $mcapTiers['Micro Cap (<$100M)']++;
        }

        $scoreDistribution = [];
        foreach ($tokens as $t) {
            $s = $t->latestCompositeScore ? (float) $t->latestCompositeScore->composite_score : null;
            if ($s === null) continue;
            $bucket = (int) floor($s);
            $bucket = min($bucket, 10);
            $label = $bucket . '-' . min($bucket + 1, 10);
            $scoreDistribution[$label] = ($scoreDistribution[$label] ?? 0) + 1;
        }
        ksort($scoreDistribution);

        return response()->json([
            'total_tokens' => $tokens->count(),
            'verdict_distribution' => $verdictDist,
            'mcap_tiers' => $mcapTiers,
            'score_distribution' => $scoreDistribution,
            'sector_performance' => $sectorPerformance,
            'top_by_score' => $topByScore,
            'top_by_volume' => $topByVolume,
        ]);
    }

    public function sectorMomentum(): JsonResponse
    {
        $overview = $this->momentum->getSectorOverview();

        return response()->json([
            'sectors' => $overview,
        ]);
    }
}
