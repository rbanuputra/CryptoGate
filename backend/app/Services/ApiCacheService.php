<?php

namespace App\Services;

use App\Models\ApiCache;
use Carbon\Carbon;

class ApiCacheService
{
    public function get(string $provider, string $endpoint, string $tokenId = ''): ?array
    {
        $key = $this->buildKey($provider, $endpoint, $tokenId);

        $cache = ApiCache::where('cache_key', $key)
            ->where('status', 'success')
            ->where('expires_at', '>', Carbon::now())
            ->first();

        return $cache?->response;
    }

    public function put(string $provider, string $endpoint, string $tokenId, array $response, int $ttlSeconds): void
    {
        $key = $this->buildKey($provider, $endpoint, $tokenId);

        ApiCache::updateOrCreate(
            ['cache_key' => $key],
            [
                'provider' => $provider,
                'response' => $response,
                'status' => 'success',
                'error_message' => null,
                'fetched_at' => Carbon::now(),
                'expires_at' => Carbon::now()->addSeconds($ttlSeconds),
            ]
        );
    }

    public function putError(string $provider, string $endpoint, string $tokenId, string $error): void
    {
        $key = $this->buildKey($provider, $endpoint, $tokenId);

        ApiCache::updateOrCreate(
            ['cache_key' => $key],
            [
                'provider' => $provider,
                'response' => null,
                'status' => 'error',
                'error_message' => $error,
                'fetched_at' => Carbon::now(),
                'expires_at' => Carbon::now(),
            ]
        );
    }

    private function buildKey(string $provider, string $endpoint, string $tokenId): string
    {
        return $tokenId ? "{$provider}:{$endpoint}:{$tokenId}" : "{$provider}:{$endpoint}";
    }
}
