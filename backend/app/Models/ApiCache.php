<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApiCache extends Model
{
    protected $table = 'api_cache';

    protected $fillable = [
        'cache_key', 'provider', 'response', 'status',
        'error_message', 'fetched_at', 'expires_at',
    ];

    protected $casts = [
        'response' => 'array',
        'fetched_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
