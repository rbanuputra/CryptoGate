<?php

namespace App\Http\Controllers;

use App\Models\AlertLog;
use App\Models\PriceAlert;
use App\Models\Token;
use App\Services\AlertService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AlertController extends Controller
{
    public function __construct(private AlertService $alertService) {}

    public function index(Request $request): JsonResponse
    {
        $query = PriceAlert::with('token:id,symbol,name,logo_url')
            ->orderByDesc('updated_at');

        if ($request->has('token_id')) {
            $query->where('token_id', $request->input('token_id'));
        }

        if ($request->has('active')) {
            $query->where('active', $request->boolean('active'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token_id' => 'required|exists:tokens,id',
            'type' => 'required|in:price_above,price_below,buy_zone_enter,tp_hit,sl_hit',
            'target_price' => 'required|numeric|min:0',
            'secondary_price' => 'nullable|numeric|min:0',
            'label' => 'nullable|string|max:100',
            'repeating' => 'nullable|boolean',
            'notes' => 'nullable|string|max:500',
        ]);

        $alert = PriceAlert::create($validated);
        $alert->load('token:id,symbol,name,logo_url');

        return response()->json($alert, 201);
    }

    public function createFromPlan(Request $request, string $tokenId): JsonResponse
    {
        Token::findOrFail($tokenId);

        $validated = $request->validate([
            'entry_low' => 'nullable|numeric|min:0',
            'entry_high' => 'nullable|numeric|min:0',
            'tp1' => 'nullable|numeric|min:0',
            'tp2' => 'nullable|numeric|min:0',
            'tp3' => 'nullable|numeric|min:0',
            'stop_loss' => 'nullable|numeric|min:0',
        ]);

        $alerts = $this->alertService->createFromPlan((int) $tokenId, $validated);

        return response()->json([
            'created' => count($alerts),
            'alerts' => PriceAlert::with('token:id,symbol,name,logo_url')
                ->whereIn('id', collect($alerts)->pluck('id'))
                ->get(),
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $alert = PriceAlert::findOrFail($id);

        $validated = $request->validate([
            'active' => 'nullable|boolean',
            'target_price' => 'nullable|numeric|min:0',
            'secondary_price' => 'nullable|numeric|min:0',
            'label' => 'nullable|string|max:100',
            'repeating' => 'nullable|boolean',
            'notes' => 'nullable|string|max:500',
        ]);

        $alert->update($validated);
        $alert->load('token:id,symbol,name,logo_url');

        return response()->json($alert);
    }

    public function destroy(string $id): JsonResponse
    {
        PriceAlert::findOrFail($id)->delete();
        return response()->json(['message' => 'Alert deleted']);
    }

    public function logs(Request $request): JsonResponse
    {
        $query = AlertLog::with(['alert.token:id,symbol,name,logo_url'])
            ->orderByDesc('created_at')
            ->limit($request->input('limit', 50));

        if ($request->has('token_id')) {
            $query->whereHas('alert', fn ($q) => $q->where('token_id', $request->input('token_id')));
        }

        return response()->json($query->get());
    }

    public function check(): JsonResponse
    {
        $result = $this->alertService->checkAll();
        return response()->json($result);
    }
}
