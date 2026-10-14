<?php

namespace App\Http\Controllers;

use App\Services\CoinDiscoveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DiscoveryController extends Controller
{
    public function __construct(private CoinDiscoveryService $discovery)
    {
    }

    public function run(Request $request): JsonResponse
    {
        set_time_limit(0);

        $validated = $request->validate([
            'per_category' => 'nullable|integer|min:1|max:50',
        ]);

        $perCategory = $validated['per_category'] ?? 15;

        $result = $this->discovery->discoverAll($perCategory);

        return response()->json($result);
    }

    public function refresh(): JsonResponse
    {
        set_time_limit(0);

        $result = $this->discovery->refreshAll();

        return response()->json($result);
    }
}
