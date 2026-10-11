<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unlock_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->date('unlock_date');
            $table->decimal('amount', 20, 2);
            $table->decimal('amount_usd', 20, 2)->nullable();
            $table->enum('category', ['team', 'investor', 'ecosystem', 'reward', 'other'])->default('other');
            $table->boolean('is_cliff')->default(false);
            $table->string('source')->nullable();
            $table->timestamps();

            $table->index(['token_id', 'unlock_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unlock_schedules');
    }
};
