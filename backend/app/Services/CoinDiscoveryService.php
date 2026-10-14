<?php

namespace App\Services;

use App\Models\SectorMapping;
use App\Models\Token;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class CoinDiscoveryService
{
    public function __construct(
        private CoinGeckoService $coinGecko,
    ) {}

    /**
     * Discover coins from all mapped CoinGecko categories.
     * Returns summary of what was added/skipped.
     */
    public function discoverAll(int $perCategory = 15, ?callable $onProgress = null): array
    {
        $categories = SectorMapping::pluck('coingecko_category')->unique()->values();

        $added = [];
        $skipped = [];
        $failed = [];
        $processed = 0;

        foreach ($categories as $category) {
            $processed++;
            if ($onProgress) {
                $onProgress($processed, $categories->count(), $category);
            }

            try {
                $result = $this->discoverByCategory($category, $perCategory);
                $added = array_merge($added, $result['added']);
                $skipped = array_merge($skipped, $result['skipped']);
            } catch (\Exception $e) {
                Log::warning("Discovery failed for category '{$category}': {$e->getMessage()}");
                $failed[] = $category;
            }

            // Rate limit: CoinGecko demo allows ~10-30 req/min
            usleep(2_500_000); // 2.5s between categories
        }

        return [
            'categories_scanned' => $categories->count(),
            'added' => $added,
            'skipped' => $skipped,
            'failed_categories' => $failed,
            'total_added' => count($added),
            'total_skipped' => count($skipped),
        ];
    }

    /**
     * Discover coins from a single CoinGecko category.
     */
    public function discoverByCategory(string $category, int $limit = 15): array
    {
        $coins = $this->coinGecko->getMarketsByCategory($this->slugify($category), $limit);

        $added = [];
        $skipped = [];

        $existingIds = Token::whereIn('coingecko_id', collect($coins)->pluck('id')->filter())
            ->pluck('coingecko_id')
            ->toArray();

        foreach ($coins as $coin) {
            $coingeckoId = $coin['id'] ?? null;
            if (!$coingeckoId) continue;

            if (in_array($coingeckoId, $existingIds)) {
                $skipped[] = $coingeckoId;
                continue;
            }

            $parsed = $this->coinGecko->parseMarketCoin($coin);
            $token = Token::create([
                'coingecko_id' => $parsed['coingecko_id'],
                'symbol' => $parsed['symbol'],
                'name' => $parsed['name'],
                'logo_url' => $parsed['logo_url'],
                'categories' => [],
            ]);

            $token->marketSnapshots()->create(array_merge($parsed['market_snapshot'], [
                'date' => Carbon::today(),
            ]));

            $added[] = $coingeckoId;
        }

        return ['added' => $added, 'skipped' => $skipped];
    }

    /**
     * Refresh market data for all existing tokens.
     */
    public function refreshAll(?callable $onProgress = null): array
    {
        $tokens = Token::all();
        $refreshed = [];
        $failed = [];
        $processed = 0;

        foreach ($tokens as $token) {
            $processed++;
            if ($onProgress) {
                $onProgress($processed, $tokens->count(), $token->symbol);
            }

            $coinData = $this->coinGecko->getCoinDetail($token->coingecko_id);

            if ($coinData) {
                $snapshot = $this->coinGecko->parseMarketSnapshot($coinData);
                $token->marketSnapshots()->updateOrCreate(
                    ['date' => Carbon::today()],
                    $snapshot,
                );

                $profile = $this->coinGecko->parseTokenProfile($coinData);
                $token->update([
                    'logo_url' => $profile['logo_url'],
                    'description_en' => $profile['description_en'],
                    'website' => $profile['website'],
                    'github_url' => $profile['github_url'],
                    'twitter_handle' => $profile['twitter_handle'],
                    'categories' => $profile['categories'],
                ]);

                $refreshed[] = $token->symbol;
            } else {
                $failed[] = $token->symbol;
            }

            usleep(1_500_000);
        }

        return [
            'total' => $tokens->count(),
            'refreshed' => $refreshed,
            'failed' => $failed,
        ];
    }

    /**
     * Convert CoinGecko category display name to slug format.
     * e.g. "Artificial Intelligence (AI)" -> "artificial-intelligence-ai"
     */
    private function slugify(string $category): string
    {
        $slug = strtolower($category);
        $slug = preg_replace('/[^a-z0-9\s-]/', '', $slug);
        $slug = preg_replace('/[\s]+/', '-', trim($slug));
        return $slug;
    }
}
