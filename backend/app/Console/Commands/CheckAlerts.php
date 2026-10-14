<?php

namespace App\Console\Commands;

use App\Services\AlertService;
use App\Services\CoinDiscoveryService;
use Illuminate\Console\Command;

class CheckAlerts extends Command
{
    protected $signature = 'alerts:check
        {--refresh : Refresh market data before checking}';

    protected $description = 'Check all active price alerts against current market data';

    public function handle(AlertService $alerts, CoinDiscoveryService $discovery): int
    {
        if ($this->option('refresh')) {
            $this->info('Refreshing market data...');
            $discovery->refreshAll(function ($current, $total, $symbol) {
                $this->line("  [{$current}/{$total}] {$symbol}");
            });
            $this->newLine();
        }

        $this->info('Checking alerts...');

        $result = $alerts->checkAll(function ($alert, $message) {
            $this->line("  <fg=yellow>TRIGGERED</> {$message}");
        });

        $this->newLine();
        $this->info("Checked: {$result['checked']} alerts");
        $this->info("Triggered: {$result['total_triggered']}");

        if ($result['total_triggered'] > 0) {
            $this->newLine();
            foreach ($result['triggered'] as $t) {
                $this->line("  [{$t['token']}] {$t['message']}");
            }
        }

        return Command::SUCCESS;
    }
}
