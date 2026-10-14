<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EtherscanService
{
    private string $apiKey;
    private int $cacheTtl;
    private ApiCacheService $cache;

    public function __construct(ApiCacheService $cache)
    {
        $this->apiKey = config('services.etherscan.api_key');
        $this->cacheTtl = (int) config('services.etherscan.cache_ttl');
        $this->cache = $cache;
    }

    /**
     * Get top token holders via Ethplorer (free, supports Ethereum ERC-20).
     */
    public function getTokenHolders(string $contractAddress, int $limit = 50): ?array
    {
        $cacheKey = "{$contractAddress}_holders";
        $cached = $this->cache->get('ethplorer', 'holders', $cacheKey);
        if ($cached) {
            return $cached;
        }

        $response = Http::timeout(15)
            ->get("https://api.ethplorer.io/getTopTokenHolders/{$contractAddress}", [
                'apiKey' => 'freekey',
                'limit' => $limit,
            ]);

        if (!$response->successful()) {
            Log::warning("Ethplorer holder fetch failed for {$contractAddress}", [
                'status' => $response->status(),
            ]);
            return null;
        }

        $data = $response->json();
        if (isset($data['error'])) {
            Log::info("Ethplorer error for {$contractAddress}", ['error' => $data['error']]);
            return null;
        }

        $holders = $data['holders'] ?? [];
        $this->cache->put('ethplorer', 'holders', $cacheKey, $holders, $this->cacheTtl);

        return $holders;
    }

    /**
     * Get token info (supply, holders count) via Ethplorer.
     */
    public function getTokenInfo(string $contractAddress): ?array
    {
        $cacheKey = "{$contractAddress}_info";
        $cached = $this->cache->get('ethplorer', 'tokeninfo', $cacheKey);
        if ($cached) {
            return $cached;
        }

        $response = Http::timeout(15)
            ->get("https://api.ethplorer.io/getTokenInfo/{$contractAddress}", [
                'apiKey' => 'freekey',
            ]);

        if (!$response->successful()) {
            return null;
        }

        $data = $response->json();
        if (isset($data['error'])) {
            return null;
        }

        $this->cache->put('ethplorer', 'tokeninfo', $cacheKey, $data, $this->cacheTtl);

        return $data;
    }

    /**
     * Analyze holder distribution from Ethplorer top holders.
     */
    public function analyzeHolderConcentration(array $holders): array
    {
        if (empty($holders)) {
            return [
                'top10_pct' => null,
                'top50_pct' => null,
                'total_holders' => 0,
            ];
        }

        $top10 = array_slice($holders, 0, 10);
        $top50 = array_slice($holders, 0, min(50, count($holders)));

        $top10Pct = array_sum(array_map(fn ($h) => (float) ($h['share'] ?? 0), $top10));
        $top50Pct = array_sum(array_map(fn ($h) => (float) ($h['share'] ?? 0), $top50));

        return [
            'top10_pct' => round($top10Pct, 4),
            'top50_pct' => round($top50Pct, 4),
            'total_holders' => count($holders),
            'holders_detail' => array_map(fn ($h) => [
                'address' => $h['address'] ?? '',
                'pct' => round((float) ($h['share'] ?? 0), 4),
            ], array_slice($holders, 0, 10)),
        ];
    }

    /**
     * Etherscan v2 request (for future non-holder queries).
     */
    public function etherscanRequest(array $params): mixed
    {
        if (empty($this->apiKey)) {
            return null;
        }

        $params['apikey'] = $this->apiKey;

        $response = Http::timeout(15)
            ->get(config('services.etherscan.base_url'), $params);

        if (!$response->successful()) {
            return null;
        }

        $data = $response->json();
        return ($data['status'] ?? '') === '1' ? $data['result'] : null;
    }
}
