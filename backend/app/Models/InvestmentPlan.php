<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvestmentPlan extends Model
{
    protected $fillable = [
        'token_id', 'status',
        'entry_low', 'entry_high', 'entry_ideal',
        'capital', 'quantity',
        'tp1', 'tp2', 'tp3',
        'stop_loss',
        'thesis', 'notes',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }
}
