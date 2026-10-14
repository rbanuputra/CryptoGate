<?php

namespace App\Console\Commands;

use App\Models\Token;
use App\Services\ScoringService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class ScoreCoins extends Command
{
    protected $signature = 'coins:score
        {--token= : Score a specific token by ID}';

    protected $description = 'Run the 3-gate scoring pipeline on all tokens';

    public function handle(ScoringService $scoring): int
    {
        $runId = Str::uuid()->toString();

        if ($tokenId = $this->option('token')) {
            $tokens = Token::with('latestMarketSnapshot')->where('id', $tokenId)->get();
        } else {
            $tokens = Token::with('latestMarketSnapshot')->get();
        }

        $this->info("Scoring {$tokens->count()} tokens (run: {$runId})...");

        $pass = $watch = $fail = $errors = 0;

        foreach ($tokens as $i => $token) {
            $result = $scoring->scoreToken($token, $runId);

            if (isset($result['error'])) {
                $errors++;
                $this->line("  [{$i}/{$tokens->count()}] {$token->symbol}: <fg=red>ERROR</> — {$result['error']}");
                continue;
            }

            $verdict = $result['verdict'];
            $color = match ($verdict) {
                'PASS' => 'green', 'WATCH' => 'yellow', default => 'red',
            };

            if ($verdict === 'PASS') $pass++;
            elseif ($verdict === 'WATCH') $watch++;
            else $fail++;

            $this->line("  [{$i}/{$tokens->count()}] {$token->symbol}: <fg={$color}>{$verdict}</> ({$result['composite_score']})");
        }

        $this->newLine();
        $this->info("Scoring complete:");
        $this->line("  Pass: {$pass} | Watch: {$watch} | Fail: {$fail} | Errors: {$errors}");

        return Command::SUCCESS;
    }
}
