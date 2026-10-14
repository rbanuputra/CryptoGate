<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Token extends Model
{
    protected $fillable = [
        'coingecko_id', 'symbol', 'name', 'chain', 'contract_address',
        'logo_url', 'description_en', 'description_id', 'translation_source',
        'website', 'github_url', 'twitter_handle', 'user_notes', 'categories',
    ];

    protected $casts = [
        'categories' => 'array',
    ];

    public function marketSnapshots(): HasMany
    {
        return $this->hasMany(MarketSnapshot::class);
    }

    public function defiMetrics(): HasMany
    {
        return $this->hasMany(DefiMetric::class);
    }

    public function unlockSchedules(): HasMany
    {
        return $this->hasMany(UnlockSchedule::class);
    }

    public function holderSnapshots(): HasMany
    {
        return $this->hasMany(HolderSnapshot::class);
    }

    public function gateScores(): HasMany
    {
        return $this->hasMany(GateScore::class);
    }

    public function compositeScores(): HasMany
    {
        return $this->hasMany(CompositeScore::class);
    }

    public function manualInputs(): HasMany
    {
        return $this->hasMany(ManualInput::class);
    }

    public function investmentPlans(): HasMany
    {
        return $this->hasMany(InvestmentPlan::class);
    }

    public function priceAlerts(): HasMany
    {
        return $this->hasMany(PriceAlert::class);
    }

    public function watchlists(): BelongsToMany
    {
        return $this->belongsToMany(Watchlist::class, 'watchlist_tokens')
            ->withPivot('notes')
            ->withTimestamps();
    }

    public function latestMarketSnapshot()
    {
        return $this->hasOne(MarketSnapshot::class)->latestOfMany('date');
    }

    public function latestDefiMetric()
    {
        return $this->hasOne(DefiMetric::class)->latestOfMany('date');
    }

    public function latestHolderSnapshot()
    {
        return $this->hasOne(HolderSnapshot::class)->latestOfMany('date');
    }

    public function latestCompositeScore()
    {
        return $this->hasOne(CompositeScore::class)->latestOfMany();
    }
}
