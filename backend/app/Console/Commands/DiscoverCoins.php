<?php

namespace App\Console\Commands;

use App\Services\CoinDiscoveryService;
use Illuminate\Console\Command;

class DiscoverCoins extends Command
{
    protected $signature = 'coins:discover
        {--per-category=15 : Number of top coins to fetch per category}
        {--refresh : Also refresh market data for existing tokens}';

    protected $description = 'Auto-discover coins from CoinGecko based on mapped narrative sectors';

    public function handle(CoinDiscoveryService $discovery): int
    {
        $perCategory = (int) $this->option('per-category');

        $this->info("Discovering coins from mapped sectors (top {$perCategory} per category)...");
        $this->newLine();

        $result = $discovery->discoverAll($perCategory, function ($current, $total, $category) {
            $this->line("  [{$current}/{$total}] Scanning: {$category}");
        });

        $this->newLine();
        $this->info("Discovery complete:");
        $this->line("  Categories scanned: {$result['categories_scanned']}");
        $this->line("  New tokens added: {$result['total_added']}");
        $this->line("  Already existed: {$result['total_skipped']}");

        if (!empty($result['failed_categories'])) {
            $this->warn("  Failed categories: " . implode(', ', $result['failed_categories']));
        }

        if (!empty($result['added'])) {
            $this->newLine();
            $this->info("Added tokens:");
            foreach ($result['added'] as $id) {
                $this->line("  + {$id}");
            }
        }

        if ($this->option('refresh')) {
            $this->newLine();
            $this->info("Refreshing market data for all tokens...");

            $refreshResult = $discovery->refreshAll(function ($current, $total, $symbol) {
                $this->line("  [{$current}/{$total}] Refreshing: {$symbol}");
            });

            $this->newLine();
            $this->info("Refresh complete:");
            $this->line("  Refreshed: " . count($refreshResult['refreshed']));
            $this->line("  Failed: " . count($refreshResult['failed']));
        }

        return Command::SUCCESS;
    }
}
