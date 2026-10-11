<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UnlockSchedule extends Model
{
    protected $fillable = [
        'token_id', 'unlock_date', 'amount', 'amount_usd',
        'category', 'is_cliff', 'source',
    ];

    protected $casts = [
        'unlock_date' => 'date',
        'is_cliff' => 'boolean',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }
}
