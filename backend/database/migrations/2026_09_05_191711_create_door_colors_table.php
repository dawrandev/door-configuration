<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The paint palette — curated, never a free colour picker.
 *
 * Add-only by design: there is no hidden flag and no edit path, because once a
 * shade is mixed and named there is no reason to take it away from a door that
 * already wears it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('door_colors', function (Blueprint $table) {
            // The catalogue id itself, not a surrogate key. These ids ('oq',
            // 'krem', 'a-m1k2j3') are already the application's identity and
            // are written into every customer selection.
            $table->string('id', 64)->primary();

            // Three columns rather than a JSON blob: the language set is closed
            // and fixed, and name_uz is searched by the bench.
            $table->string('name_uz', 120);
            $table->string('name_kk', 120);
            $table->string('name_ru', 120);

            $table->char('hex', 7);

            // Whether the pipeline shipped this or a salesperson registered it.
            // Materialised rather than derived, because the bench branches on it
            // and the SPA is handed it on every item.
            $table->enum('origin', ['builtin', 'bench'])->default('bench');

            // Order is user-visible: the first entry is the default selection.
            // Built-ins seed at 100, 200, ...; bench items append at max + 100.
            $table->unsignedInteger('position')->default(0);

            $table->timestamps();
            $table->index('position');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('door_colors');
    }
};
