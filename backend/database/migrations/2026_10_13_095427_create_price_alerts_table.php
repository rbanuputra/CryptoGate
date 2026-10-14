<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->enum('type', [
                'price_above',
                'price_below',
                'buy_zone_enter',
                'tp_hit',
                'sl_hit',
            ]);
            $table->decimal('target_price', 20, 8);
            $table->decimal('secondary_price', 20, 8)->nullable();
            $table->string('label')->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('repeating')->default(false);
            $table->timestamp('triggered_at')->nullable();
            $table->decimal('triggered_price', 20, 8)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['token_id', 'active']);
        });

        Schema::create('alert_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_alert_id')->constrained()->cascadeOnDelete();
            $table->decimal('price_at_trigger', 20, 8);
            $table->string('message');
            $table->timestamps();

            $table->index('price_alert_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alert_logs');
        Schema::dropIfExists('price_alerts');
    }
};
