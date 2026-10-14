<?php

namespace App\Services;

use App\Models\Token;

class BuyZoneService
{
    public function __construct(
        private CoinGeckoService $coinGecko,
    ) {}

    public function calculate(Token $token): array
    {
        $snapshot = $token->latestMarketSnapshot;
        $currentPrice = (float) ($snapshot?->price ?? 0);

        if ($currentPrice <= 0) {
            return ['error' => 'No price data'];
        }

        // Fetch historical data
        $ohlc = $this->coinGecko->getOhlc($token->coingecko_id, 30);
        $chartData = $this->coinGecko->getMarketChart($token->coingecko_id, 90);

        // Extract price arrays
        $prices90d = $this->extractPrices($chartData);
        $ohlcData = $this->parseOhlc($ohlc);

        // 1. Historical support levels
        $support = $this->calculateSupport($prices90d, $currentPrice);

        // 2. Fibonacci retracement
        $fib = $this->calculateFibonacci($ohlcData, $currentPrice);

        // 3. Score adjustment factor
        $compositeScore = (float) ($token->latestCompositeScore?->composite_score ?? 5);
        $scoreAdj = $this->scoreAdjustment($compositeScore);

        // Combine into buy zone
        $zone = $this->combineLevels($currentPrice, $support, $fib, $scoreAdj);

        // Calculate sell targets using Fibonacci extensions
        $targets = $this->calculateTargets($currentPrice, $fib, $scoreAdj);

        // Stop loss
        $stopLoss = $this->calculateStopLoss($zone, $support);

        return [
            'current_price' => $currentPrice,
            'buy_zone' => $zone,
            'targets' => $targets,
            'stop_loss' => $stopLoss,
            'analysis' => [
                'support' => $support,
                'fibonacci' => $fib,
                'score_adjustment' => $scoreAdj,
                'composite_score' => $compositeScore,
            ],
        ];
    }

    private function extractPrices(?array $chartData): array
    {
        if (!$chartData || empty($chartData['prices'])) {
            return [];
        }

        return array_map(fn($p) => [
            'timestamp' => $p[0],
            'price' => $p[1],
        ], $chartData['prices']);
    }

    private function parseOhlc(?array $ohlc): array
    {
        if (!$ohlc || empty($ohlc)) {
            return [];
        }

        // OHLC format: [timestamp, open, high, low, close]
        return array_map(fn($c) => [
            'timestamp' => $c[0],
            'open' => $c[1],
            'high' => $c[2],
            'low' => $c[3],
            'close' => $c[4],
        ], $ohlc);
    }

    private function calculateSupport(array $prices, float $currentPrice): array
    {
        if (empty($prices)) {
            return [
                'low_7d' => $currentPrice * 0.90,
                'low_30d' => $currentPrice * 0.85,
                'low_90d' => $currentPrice * 0.80,
                'has_data' => false,
            ];
        }

        $now = end($prices)['timestamp'];
        $d7 = $now - (7 * 86400 * 1000);
        $d30 = $now - (30 * 86400 * 1000);

        $prices7d = array_filter($prices, fn($p) => $p['timestamp'] >= $d7);
        $prices30d = array_filter($prices, fn($p) => $p['timestamp'] >= $d30);

        $low7d = !empty($prices7d) ? min(array_column($prices7d, 'price')) : $currentPrice * 0.90;
        $low30d = !empty($prices30d) ? min(array_column($prices30d, 'price')) : $currentPrice * 0.85;
        $low90d = min(array_column($prices, 'price'));

        return [
            'low_7d' => round($low7d, 8),
            'low_30d' => round($low30d, 8),
            'low_90d' => round($low90d, 8),
            'has_data' => true,
        ];
    }

    private function calculateFibonacci(array $ohlcData, float $currentPrice): array
    {
        if (empty($ohlcData)) {
            return [
                'high' => $currentPrice,
                'low' => $currentPrice * 0.80,
                'fib_0236' => $currentPrice * 0.95,
                'fib_0382' => $currentPrice * 0.92,
                'fib_0500' => $currentPrice * 0.90,
                'fib_0618' => $currentPrice * 0.88,
                'fib_0786' => $currentPrice * 0.84,
                'ext_1272' => $currentPrice * 1.25,
                'ext_1618' => $currentPrice * 1.50,
                'ext_2000' => $currentPrice * 2.00,
                'has_data' => false,
            ];
        }

        $high = max(array_column($ohlcData, 'high'));
        $low = min(array_column($ohlcData, 'low'));
        $range = $high - $low;

        if ($range <= 0) {
            $range = $currentPrice * 0.20;
            $high = $currentPrice;
            $low = $currentPrice * 0.80;
        }

        // Retracement levels (from high going down)
        $fib0236 = $high - ($range * 0.236);
        $fib0382 = $high - ($range * 0.382);
        $fib0500 = $high - ($range * 0.500);
        $fib0618 = $high - ($range * 0.618);
        $fib0786 = $high - ($range * 0.786);

        // Extension levels (from low going up beyond high)
        $ext1272 = $low + ($range * 1.272);
        $ext1618 = $low + ($range * 1.618);
        $ext2000 = $low + ($range * 2.000);

        return [
            'high' => round($high, 8),
            'low' => round($low, 8),
            'fib_0236' => round($fib0236, 8),
            'fib_0382' => round($fib0382, 8),
            'fib_0500' => round($fib0500, 8),
            'fib_0618' => round($fib0618, 8),
            'fib_0786' => round($fib0786, 8),
            'ext_1272' => round($ext1272, 8),
            'ext_1618' => round($ext1618, 8),
            'ext_2000' => round($ext2000, 8),
            'has_data' => true,
        ];
    }

    /**
     * Score < 5 → needs bigger discount (multiply by 0.90-0.95)
     * Score 5-7 → neutral (1.0)
     * Score > 7 → can buy closer to current price (1.02-1.05)
     */
    private function scoreAdjustment(float $score): array
    {
        $factor = match (true) {
            $score >= 9 => 1.05,
            $score >= 8 => 1.03,
            $score >= 7 => 1.00,
            $score >= 5 => 0.97,
            $score >= 3 => 0.93,
            default => 0.88,
        };

        return [
            'factor' => $factor,
            'label' => match (true) {
                $factor > 1.0 => 'Score tinggi — bisa entry lebih agresif',
                $factor < 1.0 => 'Score rendah — butuh diskon lebih besar',
                default => 'Score netral',
            },
        ];
    }

    private function combineLevels(float $currentPrice, array $support, array $fib, array $scoreAdj): array
    {
        $factor = $scoreAdj['factor'];

        // Entry high: Fib 0.382 retracement (shallow pullback), adjusted by score
        // Entry ideal: average of Fib 0.618 and 30d low, adjusted by score
        // Entry low: the deeper of Fib 0.786 and 90d low, adjusted by score

        $entryHigh = min($fib['fib_0382'], $currentPrice * 0.97) * $factor;
        $entryIdeal = (($fib['fib_0618'] + $support['low_30d']) / 2) * $factor;
        $entryLow = min($fib['fib_0786'], $support['low_90d']) * $factor;

        // Ensure logical order
        $entryHigh = min($entryHigh, $currentPrice * 0.99);
        if ($entryIdeal >= $entryHigh) $entryIdeal = $entryHigh * 0.96;
        if ($entryLow >= $entryIdeal) $entryLow = $entryIdeal * 0.94;

        return [
            'entry_low' => round($entryLow, 8),
            'entry_ideal' => round($entryIdeal, 8),
            'entry_high' => round($entryHigh, 8),
        ];
    }

    private function calculateTargets(float $currentPrice, array $fib, array $scoreAdj): array
    {
        $factor = $scoreAdj['factor'];

        // TP1: Fib extension 1.272 or +20% (whichever is higher)
        $tp1 = max($fib['ext_1272'], $currentPrice * 1.20);

        // TP2: Fib extension 1.618 or +50%
        $tp2 = max($fib['ext_1618'], $currentPrice * 1.50);

        // TP3: Fib extension 2.0 or +100%
        $tp3 = max($fib['ext_2000'], $currentPrice * 2.00);

        // High score tokens get slightly higher targets
        if ($factor > 1.0) {
            $tp1 *= (1 + ($factor - 1) * 2);
            $tp2 *= (1 + ($factor - 1) * 2);
            $tp3 *= (1 + ($factor - 1) * 2);
        }

        return [
            'tp1' => round($tp1, 8),
            'tp2' => round($tp2, 8),
            'tp3' => round($tp3, 8),
        ];
    }

    private function calculateStopLoss(array $zone, array $support): float
    {
        // Stop loss: 5% below entry_low or below 90d low, whichever is lower
        $belowEntry = $zone['entry_low'] * 0.95;
        $below90d = $support['low_90d'] * 0.97;

        return round(min($belowEntry, $below90d), 8);
    }
}
