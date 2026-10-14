<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AlertLog extends Model
{
    protected $fillable = [
        'price_alert_id', 'price_at_trigger', 'message',
    ];

    public function alert(): BelongsTo
    {
        return $this->belongsTo(PriceAlert::class, 'price_alert_id');
    }
}
