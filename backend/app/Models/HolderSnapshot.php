<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HolderSnapshot extends Model
{
    protected $fillable = [
        'token_id', 'date', 'top10_pct', 'top50_pct',
        'total_holders', 'holder_growth_30d',
    ];

    protected $casts = [
        'date' => 'date',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }
}
