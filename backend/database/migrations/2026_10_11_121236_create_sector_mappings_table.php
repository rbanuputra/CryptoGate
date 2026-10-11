<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sector_mappings', function (Blueprint $table) {
            $table->id();
            $table->string('narrative_sector');
            $table->string('coingecko_category');
            $table->timestamps();

            $table->unique(['narrative_sector', 'coingecko_category']);
            $table->index('narrative_sector');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sector_mappings');
    }
};
