<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TokenController;
use App\Http\Controllers\WatchlistController;
use App\Http\Controllers\ScreeningController;
use App\Http\Controllers\SettingsController;

Route::apiResource('tokens', TokenController::class);
Route::get('tokens/{token}/scores', [TokenController::class, 'scores']);

Route::apiResource('watchlists', WatchlistController::class);
Route::post('watchlists/{watchlist}/tokens', [WatchlistController::class, 'addToken']);
Route::delete('watchlists/{watchlist}/tokens/{token}', [WatchlistController::class, 'removeToken']);

Route::post('screening/run', [ScreeningController::class, 'run']);
Route::get('screening/status/{runId}', [ScreeningController::class, 'status']);

Route::get('settings/weights', [SettingsController::class, 'getWeights']);
Route::put('settings/weights', [SettingsController::class, 'updateWeights']);

Route::get('sectors', [SettingsController::class, 'getSectors']);

Route::get('search/coingecko', [TokenController::class, 'searchCoinGecko']);
