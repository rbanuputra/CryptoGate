<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gate_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->uuid('run_id');
            $table->unsignedTinyInteger('gate');
            $table->decimal('score', 4, 2);
            $table->json('breakdown')->nullable();
            $table->decimal('data_completeness_pct', 5, 2)->default(0);
            $table->timestamps();

            $table->index(['token_id', 'run_id']);
            $table->index('run_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gate_scores');
    }
};
