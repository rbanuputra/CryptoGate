<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('market_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('price', 20, 8)->nullable();
            $table->decimal('market_cap', 20, 2)->nullable();
            $table->decimal('fdv', 20, 2)->nullable();
            $table->decimal('circulating_supply', 20, 2)->nullable();
            $table->decimal('total_supply', 20, 2)->nullable();
            $table->decimal('max_supply', 20, 2)->nullable();
            $table->decimal('volume_24h', 20, 2)->nullable();
            $table->decimal('depth_bid_2pct', 20, 2)->nullable();
            $table->decimal('depth_ask_2pct', 20, 2)->nullable();
            $table->timestamps();

            $table->unique(['token_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('market_snapshots');
    }
};
