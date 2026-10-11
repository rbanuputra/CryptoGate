<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketSnapshot extends Model
{
    protected $fillable = [
        'token_id', 'date', 'price', 'market_cap', 'fdv',
        'circulating_supply', 'total_supply', 'max_supply',
        'volume_24h', 'depth_bid_2pct', 'depth_ask_2pct',
    ];

    protected $casts = [
        'date' => 'date',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }
}
