<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('defi_metrics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('tvl', 20, 2)->nullable();
            $table->decimal('fees_24h', 20, 2)->nullable();
            $table->decimal('revenue_24h', 20, 2)->nullable();
            $table->json('tvl_breakdown')->nullable();
            $table->timestamps();

            $table->unique(['token_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('defi_metrics');
    }
};
