<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DefiLlamaService
{
    private string $baseUrl;
    private int $cacheTtl;
    private ApiCacheService $cache;

    public function __construct(ApiCacheService $cache)
    {
        $this->baseUrl = config('services.defillama.base_url');
        $this->cacheTtl = (int) config('services.defillama.cache_ttl');
        $this->cache = $cache;
    }

    /**
     * Get current TVL for a protocol (lightweight endpoint).
     */
    public function getProtocolTvl(string $slug): ?float
    {
        $cached = $this->cache->get('defillama', 'tvl', $slug);
        if ($cached !== null) {
            return (float) ($cached['value'] ?? 0);
        }

        $response = Http::timeout(15)
            ->get("{$this->baseUrl}/tvl/{$slug}");

        if (!$response->successful()) {
            Log::warning("DefiLlama TVL fetch failed for {$slug}", [
                'status' => $response->status(),
            ]);
            return null;
        }

        $tvl = (float) $response->body();
        $this->cache->put('defillama', 'tvl', $slug, ['value' => $tvl], $this->cacheTtl);

        return $tvl;
    }

    public function getProtocolFees(string $slug): ?array
    {
        $cached = $this->cache->get('defillama', 'fees', $slug);
        if ($cached) {
            return $cached;
        }

        $response = Http::timeout(15)
            ->get("https://api.llama.fi/summary/fees/{$slug}");

        if (!$response->successful()) {
            return null;
        }

        $data = $response->json();
        $this->cache->put('defillama', 'fees', $slug, $data, $this->cacheTtl);

        return $data;
    }

    public function getProtocolRevenue(string $slug): ?array
    {
        $cached = $this->cache->get('defillama', 'revenue', $slug);
        if ($cached) {
            return $cached;
        }

        $response = Http::timeout(15)
            ->get("https://api.llama.fi/summary/revenue/{$slug}");

        if (!$response->successful()) {
            return null;
        }

        $data = $response->json();
        $this->cache->put('defillama', 'revenue', $slug, $data, $this->cacheTtl);

        return $data;
    }

    /**
     * Search for a protocol by name/symbol.
     * Picks the highest-TVL match when multiple versions exist (e.g. Aave V2, V3).
     */
    public function findProtocolSlug(string $name, string $symbol): ?string
    {
        $protocols = $this->getAllProtocols();
        if (!$protocols) return null;

        $nameLower = strtolower(trim($name));
        $symbolLower = strtolower(trim($symbol));

        // Exact matches first
        foreach ($protocols as $p) {
            $pName = strtolower($p['name'] ?? '');
            $pSlug = strtolower($p['slug'] ?? '');

            if ($pSlug === $nameLower || $pName === $nameLower) {
                return $p['slug'];
            }
        }

        // Symbol match — pick highest TVL
        $candidates = [];
        foreach ($protocols as $p) {
            $pSymbol = strtolower($p['symbol'] ?? '');
            $pName = strtolower($p['name'] ?? '');

            if ($pSymbol === $symbolLower || str_starts_with($pName, $nameLower)) {
                $candidates[] = $p;
            }
        }

        if (!empty($candidates)) {
            usort($candidates, fn ($a, $b) => (float) ($b['tvl'] ?? 0) <=> (float) ($a['tvl'] ?? 0));
            return $candidates[0]['slug'];
        }

        // Fuzzy: name contains
        foreach ($protocols as $p) {
            $pName = strtolower($p['name'] ?? '');
            if (str_contains($pName, $nameLower) && (float) ($p['tvl'] ?? 0) > 0) {
                return $p['slug'];
            }
        }

        return null;
    }

    public function getAllProtocols(): ?array
    {
        $cached = $this->cache->get('defillama', 'protocols', 'all');
        if ($cached) {
            return $cached;
        }

        $response = Http::timeout(30)
            ->get("{$this->baseUrl}/protocols");

        if (!$response->successful()) {
            return null;
        }

        $data = $response->json();
        $this->cache->put('defillama', 'protocols', 'all', $data, 3600 * 6);

        return $data;
    }

    public function buildMetrics(float $tvl, ?array $feesData = null, ?array $revenueData = null): array
    {
        $fees24h = $feesData ? (float) ($feesData['total24h'] ?? 0) : null;
        $revenue24h = $revenueData ? (float) ($revenueData['total24h'] ?? 0) : null;

        $chainBreakdown = null;
        if ($feesData && !empty($feesData['chainBreakdown'])) {
            $chainBreakdown = [];
            foreach ($feesData['chainBreakdown'] as $chain => $vals) {
                $chainBreakdown[$chain] = (float) ($vals['total24h'] ?? 0);
            }
        }

        return [
            'tvl' => $tvl,
            'fees_24h' => $fees24h ?: null,
            'revenue_24h' => $revenue24h ?: null,
            'tvl_breakdown' => $chainBreakdown,
        ];
    }
}
