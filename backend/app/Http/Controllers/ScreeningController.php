<?php

namespace App\Http\Controllers;

use App\Models\Token;
use App\Models\Watchlist;
use App\Services\ScoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ScreeningController extends Controller
{
    public function __construct(private ScoringService $scoring)
    {
    }

    public function run(Request $request): JsonResponse
    {
        set_time_limit(0);

        $validated = $request->validate([
            'watchlist_id' => 'nullable|exists:watchlists,id',
            'token_ids' => 'nullable|array',
            'token_ids.*' => 'exists:tokens,id',
        ]);

        if (!empty($validated['watchlist_id'])) {
            $watchlist = Watchlist::findOrFail($validated['watchlist_id']);
            $tokens = $watchlist->tokens()->with('latestMarketSnapshot')->get();
        } elseif (!empty($validated['token_ids'])) {
            $tokens = Token::with('latestMarketSnapshot')
                ->whereIn('id', $validated['token_ids'])
                ->get();
        } else {
            $tokens = Token::with('latestMarketSnapshot')->get();
        }

        if ($tokens->isEmpty()) {
            return response()->json(['message' => 'No tokens to screen'], 422);
        }

        $runId = Str::uuid()->toString();
        $results = [];

        foreach ($tokens as $token) {
            $result = $this->scoring->scoreToken($token, $runId);

            $results[] = [
                'token_id' => $token->id,
                'symbol' => $token->symbol,
                'name' => $token->name,
                'logo_url' => $token->logo_url,
                'status' => isset($result['error']) ? 'failed' : 'scored',
                'gate1' => $result['gate1'] ?? null,
                'gate2' => $result['gate2'] ?? null,
                'gate3' => $result['gate3'] ?? null,
                'composite_score' => $result['composite_score'] ?? null,
                'verdict' => $result['verdict'] ?? null,
                'error' => $result['error'] ?? null,
            ];
        }

        $scored = collect($results)->where('status', 'scored');

        return response()->json([
            'run_id' => $runId,
            'status' => 'completed',
            'total' => $tokens->count(),
            'scored' => $scored->count(),
            'pass' => $scored->where('verdict', 'PASS')->count(),
            'watch' => $scored->where('verdict', 'WATCH')->count(),
            'fail' => $scored->where('verdict', 'FAIL')->count(),
            'results' => $results,
        ]);
    }

    public function status(string $runId): JsonResponse
    {
        return response()->json([
            'run_id' => $runId,
            'status' => 'completed',
            'message' => 'Synchronous run — already completed.',
        ]);
    }
}
