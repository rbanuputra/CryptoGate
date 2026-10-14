<?php

namespace App\Http\Controllers;

use App\Models\Watchlist;
use App\Models\Token;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WatchlistController extends Controller
{
    public function index(): JsonResponse
    {
        $watchlists = Watchlist::withCount('tokens')->orderBy('name')->get();

        return response()->json($watchlists);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
        ]);

        $watchlist = Watchlist::create($validated);

        return response()->json($watchlist, 201);
    }

    public function show(string $id): JsonResponse
    {
        $watchlist = Watchlist::with([
            'tokens.latestMarketSnapshot',
            'tokens.latestCompositeScore',
        ])->findOrFail($id);

        return response()->json($watchlist);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $watchlist = Watchlist::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
        ]);

        $watchlist->update($validated);

        return response()->json($watchlist);
    }

    public function destroy(string $id): JsonResponse
    {
        $watchlist = Watchlist::findOrFail($id);
        $watchlist->delete();

        return response()->json(['message' => 'Watchlist deleted']);
    }

    public function addToken(Request $request, string $watchlistId): JsonResponse
    {
        $watchlist = Watchlist::findOrFail($watchlistId);

        $validated = $request->validate([
            'token_id' => 'required|exists:tokens,id',
            'notes' => 'nullable|string|max:1000',
        ]);

        if ($watchlist->tokens()->where('token_id', $validated['token_id'])->exists()) {
            return response()->json(['message' => 'Token already in watchlist'], 409);
        }

        $watchlist->tokens()->attach($validated['token_id'], [
            'notes' => $validated['notes'] ?? null,
        ]);

        $watchlist->load('tokens.latestMarketSnapshot');

        return response()->json($watchlist);
    }

    public function removeToken(string $watchlistId, string $tokenId): JsonResponse
    {
        $watchlist = Watchlist::findOrFail($watchlistId);

        $watchlist->tokens()->detach($tokenId);

        return response()->json(['message' => 'Token removed from watchlist']);
    }
}
