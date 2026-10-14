<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('investment_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['draft', 'active', 'closed'])->default('draft');

            // Buy zone
            $table->decimal('entry_low', 20, 8)->nullable();
            $table->decimal('entry_high', 20, 8)->nullable();
            $table->decimal('entry_ideal', 20, 8)->nullable();

            // Position
            $table->decimal('capital', 20, 2)->nullable();
            $table->decimal('quantity', 20, 8)->nullable();

            // Sell targets
            $table->decimal('tp1', 20, 8)->nullable();
            $table->decimal('tp2', 20, 8)->nullable();
            $table->decimal('tp3', 20, 8)->nullable();

            // Stop loss
            $table->decimal('stop_loss', 20, 8)->nullable();

            // Notes
            $table->text('thesis')->nullable();
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index('token_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('investment_plans');
    }
};
