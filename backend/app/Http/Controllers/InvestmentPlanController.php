<?php

namespace App\Http\Controllers;

use App\Models\InvestmentPlan;
use App\Models\Token;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvestmentPlanController extends Controller
{
    public function index(string $tokenId): JsonResponse
    {
        $plans = InvestmentPlan::where('token_id', $tokenId)
            ->orderByDesc('updated_at')
            ->get();

        return response()->json($plans);
    }

    public function store(Request $request, string $tokenId): JsonResponse
    {
        Token::findOrFail($tokenId);

        $validated = $request->validate([
            'status' => 'nullable|in:draft,active,closed',
            'entry_low' => 'nullable|numeric|min:0',
            'entry_high' => 'nullable|numeric|min:0',
            'entry_ideal' => 'nullable|numeric|min:0',
            'capital' => 'nullable|numeric|min:0',
            'quantity' => 'nullable|numeric|min:0',
            'tp1' => 'nullable|numeric|min:0',
            'tp2' => 'nullable|numeric|min:0',
            'tp3' => 'nullable|numeric|min:0',
            'stop_loss' => 'nullable|numeric|min:0',
            'thesis' => 'nullable|string|max:2000',
            'notes' => 'nullable|string|max:2000',
        ]);

        $validated['token_id'] = $tokenId;

        $plan = InvestmentPlan::create($validated);

        return response()->json($plan, 201);
    }

    public function update(Request $request, string $tokenId, string $planId): JsonResponse
    {
        $plan = InvestmentPlan::where('token_id', $tokenId)->findOrFail($planId);

        $validated = $request->validate([
            'status' => 'nullable|in:draft,active,closed',
            'entry_low' => 'nullable|numeric|min:0',
            'entry_high' => 'nullable|numeric|min:0',
            'entry_ideal' => 'nullable|numeric|min:0',
            'capital' => 'nullable|numeric|min:0',
            'quantity' => 'nullable|numeric|min:0',
            'tp1' => 'nullable|numeric|min:0',
            'tp2' => 'nullable|numeric|min:0',
            'tp3' => 'nullable|numeric|min:0',
            'stop_loss' => 'nullable|numeric|min:0',
            'thesis' => 'nullable|string|max:2000',
            'notes' => 'nullable|string|max:2000',
        ]);

        $plan->update($validated);

        return response()->json($plan);
    }

    public function destroy(string $tokenId, string $planId): JsonResponse
    {
        $plan = InvestmentPlan::where('token_id', $tokenId)->findOrFail($planId);
        $plan->delete();

        return response()->json(['message' => 'Plan deleted']);
    }
}
