<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Watchlist extends Model
{
    protected $fillable = ['name', 'description'];

    public function tokens(): BelongsToMany
    {
        return $this->belongsToMany(Token::class, 'watchlist_tokens')
            ->withPivot('notes')
            ->withTimestamps();
    }
}
