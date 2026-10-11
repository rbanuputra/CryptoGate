<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DefiMetric extends Model
{
    protected $fillable = [
        'token_id', 'date', 'tvl', 'fees_24h', 'revenue_24h', 'tvl_breakdown',
    ];

    protected $casts = [
        'date' => 'date',
        'tvl_breakdown' => 'array',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }
}
