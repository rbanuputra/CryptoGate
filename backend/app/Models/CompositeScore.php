<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompositeScore extends Model
{
    protected $fillable = [
        'token_id', 'run_id', 'composite_score', 'verdict',
        'weights', 'override_verdict', 'override_reason',
        'momentum_score', 'momentum_mode',
    ];

    protected $casts = [
        'weights' => 'array',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }

    public function gateScores()
    {
        return GateScore::where('run_id', $this->run_id)
            ->where('token_id', $this->token_id)
            ->get();
    }
}
