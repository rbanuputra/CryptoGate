<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SectorMapping extends Model
{
    protected $fillable = ['narrative_sector', 'coingecko_category'];
}
