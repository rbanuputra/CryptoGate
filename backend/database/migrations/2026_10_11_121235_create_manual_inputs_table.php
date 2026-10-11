<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manual_inputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('token_id')->constrained()->cascadeOnDelete();
            $table->string('field_name');
            $table->text('field_value');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['token_id', 'field_name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manual_inputs');
    }
};
