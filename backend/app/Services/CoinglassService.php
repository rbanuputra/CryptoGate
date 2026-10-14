<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CoinglassService
{
    private ApiCacheService $cache;
    private int $cacheTtl;

    public function __construct(ApiCacheService $cache)
    {
        $this->cache = $cache;
        $this->cacheTtl = 300;
    }

    public function getDerivativesOverview(string $symbol): array
    {
        $pair = strtoupper($symbol) . 'USDT';

        $result = [
            'symbol' => $symbol,
            'has_data' => false,
        ];

        $binance = $this->fetchBinance($pair);
        $bybit = $this->fetchBybit($symbol);

        $fundingData = [];
        $avgRate = 0;
        $count = 0;

        if ($binance) {
            if (isset($binance['funding'])) {
                $rate = (float) $binance['funding']['lastFundingRate'];
                $fundingData[] = ['exchange' => 'Binance', 'rate' => $rate];
                $avgRate += $rate;
                $count++;
            }
            if (isset($binance['oi'])) {
                $result['open_interest'] = (float) $binance['oi']['openInterest'];
                $result['has_data'] = true;
            }
            if (isset($binance['ticker'])) {
                $t = $binance['ticker'];
                $result['futures_volume_24h'] = (float) ($t['quoteVolume'] ?? 0);
                $result['price_change_pct'] = (float) ($t['priceChangePercent'] ?? 0);
                $result['high_24h'] = (float) ($t['highPrice'] ?? 0);
                $result['low_24h'] = (float) ($t['lowPrice'] ?? 0);
                $result['last_price'] = (float) ($t['lastPrice'] ?? 0);
                $result['has_data'] = true;
            }
        }

        if ($bybit) {
            if (isset($bybit['funding_rate'])) {
                $rate = (float) $bybit['funding_rate'];
                $fundingData[] = ['exchange' => 'Bybit', 'rate' => $rate];
                $avgRate += $rate;
                $count++;
            }
            if (isset($bybit['open_interest'])) {
                $bybitOi = (float) $bybit['open_interest'];
                $result['open_interest'] = ($result['open_interest'] ?? 0) + $bybitOi;
                $result['has_data'] = true;
            }
        }

        if ($count > 0) {
            $result['funding_rate'] = round($avgRate / $count, 6);
            $result['funding_rate_annualized'] = round($result['funding_rate'] * 3 * 365 * 100, 2);
            $result['exchanges_count'] = $count;
            $result['funding_data'] = $fundingData;
            $result['has_data'] = true;
        }

        if (isset($result['open_interest'])) {
            $result['oi_exchanges'] = ($binance && isset($binance['oi']) ? 1 : 0) + ($bybit && isset($bybit['open_interest']) ? 1 : 0);
        }

        return $result;
    }

    private function fetchBinance(string $pair): ?array
    {
        $cacheKey = "{$pair}_binance";
        $cached = $this->cache->get('derivatives', 'binance', $cacheKey);
        if ($cached) return $cached;

        $result = [];

        try {
            $fundingResp = Http::timeout(10)->get('https://fapi.binance.com/fapi/v1/fundingRate', [
                'symbol' => $pair,
                'limit' => 1,
            ]);
            if ($fundingResp->successful()) {
                $data = $fundingResp->json();
                if (!empty($data)) {
                    $result['funding'] = $data[0];
                }
            }
        } catch (\Exception $e) {
            Log::info("Binance funding rate failed: {$e->getMessage()}");
        }

        try {
            $oiResp = Http::timeout(10)->get('https://fapi.binance.com/fapi/v1/openInterest', [
                'symbol' => $pair,
            ]);
            if ($oiResp->successful()) {
                $data = $oiResp->json();
                if (!empty($data) && isset($data['openInterest'])) {
                    $result['oi'] = $data;
                }
            }
        } catch (\Exception $e) {
            Log::info("Binance OI failed: {$e->getMessage()}");
        }

        try {
            $tickerResp = Http::timeout(10)->get('https://fapi.binance.com/fapi/v1/ticker/24hr', [
                'symbol' => $pair,
            ]);
            if ($tickerResp->successful()) {
                $data = $tickerResp->json();
                if (!empty($data) && isset($data['lastPrice'])) {
                    $result['ticker'] = $data;
                }
            }
        } catch (\Exception $e) {
            Log::info("Binance ticker failed: {$e->getMessage()}");
        }

        if (empty($result)) return null;

        $this->cache->put('derivatives', 'binance', $cacheKey, $result, $this->cacheTtl);
        return $result;
    }

    private function fetchBybit(string $symbol): ?array
    {
        $pair = strtoupper($symbol) . 'USDT';
        $cacheKey = "{$pair}_bybit";
        $cached = $this->cache->get('derivatives', 'bybit', $cacheKey);
        if ($cached) return $cached;

        $result = [];

        try {
            $resp = Http::timeout(10)->get('https://api.bybit.com/v5/market/tickers', [
                'category' => 'linear',
                'symbol' => $pair,
            ]);
            if ($resp->successful()) {
                $data = $resp->json();
                $list = $data['result']['list'] ?? [];
                if (!empty($list)) {
                    $ticker = $list[0];
                    $result['funding_rate'] = $ticker['fundingRate'] ?? null;
                    $result['open_interest'] = $ticker['openInterestValue'] ?? null;
                    $result['bybit_volume_24h'] = $ticker['turnover24h'] ?? null;
                }
            }
        } catch (\Exception $e) {
            Log::info("Bybit ticker failed: {$e->getMessage()}");
        }

        if (empty($result)) return null;

        $this->cache->put('derivatives', 'bybit', $cacheKey, $result, $this->cacheTtl);
        return $result;
    }
}
