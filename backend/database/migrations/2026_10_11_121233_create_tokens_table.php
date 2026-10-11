<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tokens', function (Blueprint $table) {
            $table->id();
            $table->string('coingecko_id')->unique();
            $table->string('symbol', 20);
            $table->string('name');
            $table->string('chain')->nullable();
            $table->string('contract_address')->nullable();
            $table->string('logo_url')->nullable();
            $table->text('description_en')->nullable();
            $table->text('description_id')->nullable();
            $table->enum('translation_source', ['manual', 'google', 'llm'])->nullable();
            $table->string('website')->nullable();
            $table->string('github_url')->nullable();
            $table->string('twitter_handle')->nullable();
            $table->text('user_notes')->nullable();
            $table->json('categories')->nullable();
            $table->timestamps();

            $table->index('symbol');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tokens');
    }
};
