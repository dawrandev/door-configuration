<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A room: an interior photograph with the doorway it already has.
 *
 * Mirrors `Room` in kiosk/src/catalog/types.ts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rooms', function (Blueprint $table) {
            $table->string('id', 64)->primary();

            $table->string('name_uz', 160);
            $table->string('name_kk', 160);
            $table->string('name_ru', 160);

            // The STAGE image: the doorway replaced by an unlit recess, so a
            // leaf that misses its opening by a pixel shows dark — a shadow gap,
            // which is real — instead of the original door's bright white edge.
            $table->string('image_path');
            // The untouched photograph, door and all. Shown in the chooser, and
            // the source the trim's lighting is derived from: cropping the
            // recess into that estimate washed the casing out.
            $table->string('thumb_path')->nullable();
            // The bench's reopen source. Usually the same file as thumb_path.
            $table->string('source_path')->nullable();

            $table->decimal('aspect', 10, 5);

            // The doorway, as fractions of the image: {x, y, w, h}.
            $table->json('open');
            // The architrave, as a list of pieces. JSON and not normalised
            // because the point ORDER inside each piece is load-bearing —
            // recolor.ts's signedArea/windLike depend on it, and a query that
            // forgot ORDER BY would corrupt a traced shape silently.
            $table->json('trim_boxes')->nullable();
            // The room's own light as an RGB multiplier, so a neutral-white leaf
            // can be relit to belong instead of reading as a cold cut-out.
            $table->json('light');
            // The doorway box as the bench last had it, for reopening.
            $table->json('box')->nullable();

            $table->enum('origin', ['builtin', 'bench'])->default('bench');
            $table->boolean('overridden')->default(false);
            $table->boolean('hidden')->default(false);
            $table->unsignedInteger('position')->default(0);

            $table->timestamps();
            $table->index(['hidden', 'position']);
            $table->index('name_uz');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rooms');
    }
};
