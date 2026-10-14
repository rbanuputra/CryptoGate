<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TokenController;
use App\Http\Controllers\WatchlistController;
use App\Http\Controllers\ScreeningController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\DiscoveryController;
use App\Http\Controllers\InvestmentPlanController;
use App\Http\Controllers\AlertController;
use App\Http\Controllers\AnalyticsController;

Route::get('analytics/overview', [AnalyticsController::class, 'overview']);
Route::get('analytics/sector-momentum', [AnalyticsController::class, 'sectorMomentum']);

Route::apiResource('tokens', TokenController::class);
Route::get('tokens/{token}/scores', [TokenController::class, 'scores']);
Route::post('tokens/{token}/score', [TokenController::class, 'score']);
Route::get('tokens/{token}/buy-zone', [TokenController::class, 'buyZone']);
Route::post('tokens/{token}/refresh', [TokenController::class, 'refreshMarketData']);
Route::post('tokens/{token}/fetch-defi', [TokenController::class, 'fetchDefi']);
Route::post('tokens/{token}/fetch-holders', [TokenController::class, 'fetchHolders']);
Route::get('tokens/{token}/score-history', [TokenController::class, 'scoreHistory']);
Route::get('tokens/{token}/momentum', [TokenController::class, 'fetchMomentum']);

Route::apiResource('watchlists', WatchlistController::class);
Route::post('watchlists/{watchlist}/tokens', [WatchlistController::class, 'addToken']);
Route::delete('watchlists/{watchlist}/tokens/{token}', [WatchlistController::class, 'removeToken']);

Route::post('screening/run', [ScreeningController::class, 'run']);
Route::get('screening/status/{runId}', [ScreeningController::class, 'status']);

Route::get('settings/weights', [SettingsController::class, 'getWeights']);
Route::put('settings/weights', [SettingsController::class, 'updateWeights']);

Route::get('sectors', [SettingsController::class, 'getSectors']);

Route::get('search/coingecko', [TokenController::class, 'searchCoinGecko']);

Route::post('discover/run', [DiscoveryController::class, 'run']);
Route::post('discover/refresh', [DiscoveryController::class, 'refresh']);

Route::get('tokens/{token}/plans', [InvestmentPlanController::class, 'index']);
Route::post('tokens/{token}/plans', [InvestmentPlanController::class, 'store']);
Route::put('tokens/{token}/plans/{plan}', [InvestmentPlanController::class, 'update']);
Route::delete('tokens/{token}/plans/{plan}', [InvestmentPlanController::class, 'destroy']);

Route::get('alerts', [AlertController::class, 'index']);
Route::post('alerts', [AlertController::class, 'store']);
Route::put('alerts/{alert}', [AlertController::class, 'update']);
Route::delete('alerts/{alert}', [AlertController::class, 'destroy']);
Route::post('alerts/check', [AlertController::class, 'check']);
Route::get('alerts/logs', [AlertController::class, 'logs']);
Route::post('tokens/{token}/alerts/from-plan', [AlertController::class, 'createFromPlan']);
