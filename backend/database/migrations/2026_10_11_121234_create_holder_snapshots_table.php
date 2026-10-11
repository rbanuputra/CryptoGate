<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('holder_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('top10_pct', 8, 4)->nullable();
            $table->decimal('top50_pct', 8, 4)->nullable();
            $table->unsignedInteger('total_holders')->nullable();
            $table->decimal('holder_growth_30d', 8, 4)->nullable();
            $table->timestamps();

            $table->unique(['token_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('holder_snapshots');
    }
};
