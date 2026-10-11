<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GateScore extends Model
{
    protected $fillable = [
        'token_id', 'run_id', 'gate', 'score',
        'breakdown', 'data_completeness_pct',
    ];

    protected $casts = [
        'breakdown' => 'array',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }
}
