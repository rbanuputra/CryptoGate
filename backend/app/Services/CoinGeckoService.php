<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CoinGeckoService
{
    private string $baseUrl;
    private string $apiKey;
    private int $cacheTtl;
    private ApiCacheService $cache;

    public function __construct(ApiCacheService $cache)
    {
        $this->baseUrl = config('services.coingecko.base_url');
        $this->apiKey = config('services.coingecko.api_key');
        $this->cacheTtl = (int) config('services.coingecko.cache_ttl');
        $this->cache = $cache;
    }

    public function searchCoins(string $query): array
    {
        $cached = $this->cache->get('coingecko', 'search', md5($query));
        if ($cached) {
            return $cached;
        }

        $response = $this->request('/search', ['query' => $query]);

        if ($response) {
            $this->cache->put('coingecko', 'search', md5($query), $response, 300);
        }

        return $response ?? [];
    }

    public function getCoinDetail(string $coingeckoId): ?array
    {
        $cached = $this->cache->get('coingecko', 'coins', $coingeckoId);
        if ($cached) {
            return $cached;
        }

        $response = $this->request("/coins/{$coingeckoId}", [
            'localization' => 'false',
            'tickers' => 'true',
            'market_data' => 'true',
            'community_data' => 'false',
            'developer_data' => 'false',
        ]);

        if ($response) {
            $this->cache->put('coingecko', 'coins', $coingeckoId, $response, $this->cacheTtl);
        }

        return $response;
    }

    public function getMarketData(array $coinIds): array
    {
        $idsString = implode(',', $coinIds);
        $cacheKey = md5($idsString);

        $cached = $this->cache->get('coingecko', 'markets', $cacheKey);
        if ($cached) {
            return $cached;
        }

        $response = $this->request('/coins/markets', [
            'vs_currency' => 'usd',
            'ids' => $idsString,
            'order' => 'market_cap_desc',
            'per_page' => 250,
            'page' => 1,
            'sparkline' => 'false',
        ]);

        if ($response) {
            $this->cache->put('coingecko', 'markets', $cacheKey, $response, $this->cacheTtl);
        }

        return $response ?? [];
    }

    public function getMarketChart(string $coingeckoId, int $days = 90): ?array
    {
        $cacheKey = md5("{$coingeckoId}_{$days}");

        $cached = $this->cache->get('coingecko', 'market_chart', $cacheKey);
        if ($cached) {
            return $cached;
        }

        $response = $this->request("/coins/{$coingeckoId}/market_chart", [
            'vs_currency' => 'usd',
            'days' => $days,
            'interval' => $days > 30 ? 'daily' : '',
        ]);

        if ($response) {
            $this->cache->put('coingecko', 'market_chart', $cacheKey, $response, 3600);
        }

        return $response;
    }

    public function getOhlc(string $coingeckoId, int $days = 30): ?array
    {
        $cacheKey = md5("{$coingeckoId}_ohlc_{$days}");

        $cached = $this->cache->get('coingecko', 'ohlc', $cacheKey);
        if ($cached) {
            return $cached;
        }

        $response = $this->request("/coins/{$coingeckoId}/ohlc", [
            'vs_currency' => 'usd',
            'days' => $days,
        ]);

        if ($response) {
            $this->cache->put('coingecko', 'ohlc', $cacheKey, $response, 3600);
        }

        return $response;
    }

    public function getCategories(): array
    {
        $cached = $this->cache->get('coingecko', 'categories', 'all');
        if ($cached) {
            return $cached;
        }

        $response = $this->request('/coins/categories');

        if ($response) {
            $this->cache->put('coingecko', 'categories', 'all', $response, 3600);
        }

        return $response ?? [];
    }

    public function getMarketsByCategory(string $category, int $perPage = 20, int $page = 1): array
    {
        $cacheKey = md5("{$category}_{$perPage}_{$page}");

        $cached = $this->cache->get('coingecko', 'markets_category', $cacheKey);
        if ($cached) {
            return $cached;
        }

        $response = $this->request('/coins/markets', [
            'vs_currency' => 'usd',
            'category' => $category,
            'order' => 'market_cap_desc',
            'per_page' => $perPage,
            'page' => $page,
            'sparkline' => 'false',
        ]);

        if ($response) {
            $this->cache->put('coingecko', 'markets_category', $cacheKey, $response, $this->cacheTtl);
        }

        return $response ?? [];
    }

    public function parseMarketCoin(array $coin): array
    {
        return [
            'coingecko_id' => $coin['id'],
            'symbol' => strtoupper($coin['symbol'] ?? ''),
            'name' => $coin['name'] ?? '',
            'logo_url' => $coin['image'] ?? null,
            'market_snapshot' => [
                'price' => $coin['current_price'] ?? null,
                'market_cap' => $coin['market_cap'] ?? null,
                'fdv' => $coin['fully_diluted_valuation'] ?? null,
                'circulating_supply' => $coin['circulating_supply'] ?? null,
                'total_supply' => $coin['total_supply'] ?? null,
                'max_supply' => $coin['max_supply'] ?? null,
                'volume_24h' => $coin['total_volume'] ?? null,
            ],
        ];
    }

    private function request(string $endpoint, array $params = []): ?array
    {
        $headers = [];
        if ($this->apiKey) {
            $headers['x-cg-demo-api-key'] = $this->apiKey;
        }

        $maxRetries = 3;

        for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
            try {
                $response = Http::withHeaders($headers)
                    ->timeout(15)
                    ->get($this->baseUrl . $endpoint, $params);

                if ($response->status() === 429) {
                    $wait = min(pow(2, $attempt), 60);
                    Log::warning("CoinGecko rate limited, waiting {$wait}s (attempt {$attempt})");
                    sleep($wait);
                    continue;
                }

                if ($response->successful()) {
                    return $response->json();
                }

                Log::error("CoinGecko API error: {$response->status()} on {$endpoint}");
                return null;
            } catch (\Exception $e) {
                Log::error("CoinGecko request failed: {$e->getMessage()}");
                if ($attempt < $maxRetries) {
                    sleep(pow(2, $attempt));
                }
            }
        }

        return null;
    }

    public function parseMarketSnapshot(array $coinData): array
    {
        $marketData = $coinData['market_data'] ?? $coinData;

        return [
            'price' => $marketData['current_price']['usd'] ?? $marketData['current_price'] ?? null,
            'market_cap' => $marketData['market_cap']['usd'] ?? $marketData['market_cap'] ?? null,
            'fdv' => $marketData['fully_diluted_valuation']['usd'] ?? $marketData['fully_diluted_valuation'] ?? null,
            'circulating_supply' => $marketData['circulating_supply'] ?? null,
            'total_supply' => $marketData['total_supply'] ?? null,
            'max_supply' => $marketData['max_supply'] ?? null,
            'volume_24h' => $marketData['total_volume']['usd'] ?? $marketData['total_volume'] ?? null,
        ];
    }

    public function parseTokenProfile(array $coinData): array
    {
        $platforms = $coinData['platforms'] ?? [];
        $chain = !empty($platforms) ? array_key_first($platforms) : null;
        $contractAddress = $chain ? ($platforms[$chain] ?? null) : null;

        return [
            'coingecko_id' => $coinData['id'],
            'symbol' => strtoupper($coinData['symbol'] ?? ''),
            'name' => $coinData['name'] ?? '',
            'chain' => $chain,
            'contract_address' => $contractAddress ?: null,
            'logo_url' => $coinData['image']['large'] ?? $coinData['image']['small'] ?? $coinData['image'] ?? null,
            'description_en' => $coinData['description']['en'] ?? null,
            'website' => $coinData['links']['homepage'][0] ?? null,
            'github_url' => $coinData['links']['repos_url']['github'][0] ?? null,
            'twitter_handle' => $coinData['links']['twitter_screen_name'] ?? null,
            'categories' => $coinData['categories'] ?? [],
        ];
    }
}
