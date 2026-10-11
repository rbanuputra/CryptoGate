<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('composite_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->uuid('run_id');
            $table->decimal('composite_score', 4, 2);
            $table->enum('verdict', ['PASS', 'WATCH', 'FAIL', 'INCOMPLETE'])->default('INCOMPLETE');
            $table->json('weights')->nullable();
            $table->enum('override_verdict', ['PASS', 'WATCH', 'FAIL'])->nullable();
            $table->text('override_reason')->nullable();
            $table->decimal('momentum_score', 4, 2)->nullable();
            $table->string('momentum_mode')->nullable();
            $table->timestamps();

            $table->index(['token_id', 'run_id']);
            $table->index('run_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('composite_scores');
    }
};
