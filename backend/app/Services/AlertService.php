<?php

namespace App\Services;

use App\Models\AlertLog;
use App\Models\PriceAlert;
use App\Models\Token;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class AlertService
{
    public function checkAll(?callable $onTrigger = null): array
    {
        $alerts = PriceAlert::where('active', true)
            ->with(['token.latestMarketSnapshot'])
            ->get();

        $triggered = [];
        $checked = 0;

        foreach ($alerts as $alert) {
            $checked++;
            $price = (float) ($alert->token->latestMarketSnapshot?->price ?? 0);

            if ($price <= 0) continue;

            $shouldTrigger = $this->evaluate($alert, $price);

            if ($shouldTrigger) {
                $message = $this->buildMessage($alert, $price);

                $alert->update([
                    'triggered_at' => Carbon::now(),
                    'triggered_price' => $price,
                    'active' => $alert->repeating,
                ]);

                AlertLog::create([
                    'price_alert_id' => $alert->id,
                    'price_at_trigger' => $price,
                    'message' => $message,
                ]);

                $triggered[] = [
                    'alert_id' => $alert->id,
                    'token' => $alert->token->symbol,
                    'type' => $alert->type,
                    'message' => $message,
                    'price' => $price,
                ];

                if ($onTrigger) {
                    $onTrigger($alert, $message);
                }
            }
        }

        return [
            'checked' => $checked,
            'triggered' => $triggered,
            'total_triggered' => count($triggered),
        ];
    }

    private function evaluate(PriceAlert $alert, float $price): bool
    {
        $target = (float) $alert->target_price;
        $secondary = (float) ($alert->secondary_price ?? 0);

        return match ($alert->type) {
            'price_above' => $price >= $target,
            'price_below' => $price <= $target,
            'buy_zone_enter' => $price <= $target && ($secondary <= 0 || $price >= $secondary),
            'tp_hit' => $price >= $target,
            'sl_hit' => $price <= $target,
            default => false,
        };
    }

    private function buildMessage(PriceAlert $alert, float $price): string
    {
        $symbol = $alert->token->symbol;
        $target = number_format((float) $alert->target_price, 2);
        $current = number_format($price, 2);
        $label = $alert->label ? " ({$alert->label})" : '';

        return match ($alert->type) {
            'price_above' => "{$symbol} naik ke \${$current} — di atas target \${$target}{$label}",
            'price_below' => "{$symbol} turun ke \${$current} — di bawah target \${$target}{$label}",
            'buy_zone_enter' => "{$symbol} masuk buy zone di \${$current}{$label} — siap beli!",
            'tp_hit' => "{$symbol} hit TP di \${$current} (target \${$target}){$label} — take profit!",
            'sl_hit' => "{$symbol} hit SL di \${$current} (stop \${$target}){$label} — cut loss!",
            default => "{$symbol} alert triggered at \${$current}",
        };
    }

    public function createFromPlan(int $tokenId, array $plan): array
    {
        $created = [];

        if (!empty($plan['entry_high']) && !empty($plan['entry_low'])) {
            $created[] = PriceAlert::create([
                'token_id' => $tokenId,
                'type' => 'buy_zone_enter',
                'target_price' => $plan['entry_high'],
                'secondary_price' => $plan['entry_low'],
                'label' => 'Buy Zone',
                'active' => true,
            ]);
        }

        foreach (['tp1' => 'TP1', 'tp2' => 'TP2', 'tp3' => 'TP3'] as $field => $label) {
            if (!empty($plan[$field])) {
                $created[] = PriceAlert::create([
                    'token_id' => $tokenId,
                    'type' => 'tp_hit',
                    'target_price' => $plan[$field],
                    'label' => $label,
                    'active' => true,
                ]);
            }
        }

        if (!empty($plan['stop_loss'])) {
            $created[] = PriceAlert::create([
                'token_id' => $tokenId,
                'type' => 'sl_hit',
                'target_price' => $plan['stop_loss'],
                'label' => 'Stop Loss',
                'active' => true,
            ]);
        }

        return $created;
    }
}
