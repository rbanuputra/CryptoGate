<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PriceAlert extends Model
{
    protected $fillable = [
        'token_id', 'type', 'target_price', 'secondary_price',
        'label', 'active', 'repeating',
        'triggered_at', 'triggered_price', 'notes',
    ];

    protected $casts = [
        'active' => 'boolean',
        'repeating' => 'boolean',
        'triggered_at' => 'datetime',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(AlertLog::class);
    }
}
