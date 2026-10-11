<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ManualInput extends Model
{
    protected $fillable = [
        'token_id', 'field_name', 'field_value', 'notes',
    ];

    public function token(): BelongsTo
    {
        return $this->belongsTo(Token::class);
    }
}
