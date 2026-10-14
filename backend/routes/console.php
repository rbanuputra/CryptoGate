<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('coins:discover --per-category=10')
    ->dailyAt('02:00')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/discover.log'));

Schedule::command('coins:score')
    ->dailyAt('03:00')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/scoring.log'));

Schedule::command('alerts:check --refresh')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/alerts.log'));
