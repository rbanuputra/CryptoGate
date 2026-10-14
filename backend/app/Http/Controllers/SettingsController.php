<?php

namespace App\Http\Controllers;

use App\Models\SectorMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingsController extends Controller
{
    private string $settingsFile = 'settings.json';

    public function getWeights(): JsonResponse
    {
        $settings = $this->loadSettings();

        return response()->json([
            'weights' => $settings['weights'] ?? [
                'gate1' => 0.35,
                'gate2' => 0.40,
                'gate3' => 0.25,
            ],
            'momentum_mode' => $settings['momentum_mode'] ?? 'off',
        ]);
    }

    public function updateWeights(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'weights.gate1' => 'required|numeric|min:0|max:1',
            'weights.gate2' => 'required|numeric|min:0|max:1',
            'weights.gate3' => 'required|numeric|min:0|max:1',
            'momentum_mode' => 'nullable|in:on,off',
        ]);

        $weights = $validated['weights'];
        $sum = $weights['gate1'] + $weights['gate2'] + $weights['gate3'];

        if (abs($sum - 1.0) > 0.01) {
            return response()->json([
                'message' => 'Weights must sum to 1.0',
                'current_sum' => $sum,
            ], 422);
        }

        $settings = $this->loadSettings();
        $settings['weights'] = $weights;
        if (isset($validated['momentum_mode'])) {
            $settings['momentum_mode'] = $validated['momentum_mode'];
        }

        $this->saveSettings($settings);

        return response()->json($settings);
    }

    public function getSectors(): JsonResponse
    {
        $sectors = SectorMapping::orderBy('narrative_sector')
            ->get()
            ->groupBy('narrative_sector')
            ->map(fn ($mappings) => $mappings->pluck('coingecko_category')->toArray());

        return response()->json($sectors);
    }

    private function loadSettings(): array
    {
        if (Storage::disk('local')->exists($this->settingsFile)) {
            return json_decode(Storage::disk('local')->get($this->settingsFile), true) ?? [];
        }

        return [];
    }

    private function saveSettings(array $settings): void
    {
        Storage::disk('local')->put($this->settingsFile, json_encode($settings, JSON_PRETTY_PRINT));
    }
}
