<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A nalichnik or korona design the customer picks independently of the door and
 * the room. Mirrors `TrimModel` in kiosk/src/catalog/types.ts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trim_models', function (Blueprint $table) {
            $table->string('id', 64)->primary();

            $table->string('name_uz', 160);
            $table->string('name_kk', 160);
            $table->string('name_ru', 160);

            // Two fully independent customer picks. A korona must never come
            // back as a nalichnik, so the category travels on the row.
            $table->enum('category', ['nalichnik', 'korona']);

            // How far past the door's own rect this design reaches, as fractions
            // of that rect. Measured from the photograph, not chosen.
            $table->json('trim_margin');
            // The traced pieces. JSON for the same reason as rooms.trim_boxes.
            $table->json('trim_boxes');

            // The padded, rectified crop the pieces are measured against.
            $table->string('trim_source_path');
            $table->string('source_path')->nullable();
            $table->json('corners')->nullable();

            /**
             * The door this design was traced from, when it came from a door's
             * own trim stage rather than from the standalone trim bench.
             *
             * This replaces the frontend's `derivedTrimId()`, which minted ids
             * as `a-<leafId>-<category>` and did string surgery on them to find
             * a door's designs again. The unique index below is what actually
             * enforces the property that convention was reaching for:
             * republishing a door REPLACES its designs instead of appending a
             * second pair and orphaning the first.
             */
            $table->string('owner_leaf_id', 64)->nullable();
            $table->foreign('owner_leaf_id')->references('id')->on('leaves')->nullOnDelete();
            $table->unique(['owner_leaf_id', 'category']);

            $table->enum('origin', ['builtin', 'bench'])->default('bench');
            $table->boolean('overridden')->default(false);
            $table->boolean('hidden')->default(false);
            $table->unsignedInteger('position')->default(0);

            $table->timestamps();
            $table->index(['category', 'hidden', 'position']);
            $table->index('name_uz');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trim_models');
    }
};
