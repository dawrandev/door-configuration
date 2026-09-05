<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A door leaf: the photograph of a real product, squared up.
 *
 * Mirrors `Leaf` in kiosk/src/catalog/types.ts. That interface is the contract —
 * the API resource has to reproduce it exactly, or the showroom quietly renders
 * the wrong thing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leaves', function (Blueprint $table) {
            $table->string('id', 64)->primary();

            $table->string('name_uz', 160);
            $table->string('name_kk', 160);
            $table->string('name_ru', 160);

            // Paths under storage/app/public, content-hashed
            // ('catalog/leaves/lattice/image-9f3ab21c.webp'). The hash is not
            // decoration: recolor.ts keys its render cache on the source string,
            // so a stable filename would serve a re-cut door its predecessor's
            // recolour forever.
            $table->string('image_path');
            // The compact original, kept so the bench can reopen and re-cut.
            $table->string('source_path')->nullable();

            // width / height, measured from the corners — never assumed.
            $table->decimal('aspect', 8, 4);

            $table->enum('handle_side', ['left', 'right']);
            // False while the leaf still wears the handle it was photographed
            // with; the stage then composites nothing over it.
            $table->boolean('handle_swappable')->default(false);
            // {x, y} as fractions of the leaf. Absent when not swappable.
            $table->json('handle_at')->nullable();

            // The four marked corners, as fractions — what lets a door be
            // reopened and re-cut rather than deleted and redone.
            $table->json('corners')->nullable();
            // Regions the recolour must NOT touch: a brass medallion, a logo.
            // Stored because the renderer reads it; no bench authors it yet.
            $table->json('keep_regions')->nullable();

            $table->boolean('white')->default(true);
            $table->enum('handle_choice', ['left', 'right', 'none'])->default('none');

            // 'all' is the absence of a restriction, and is NOT the same as
            // listing every colour that exists today: a door on 'all' picks up
            // colours registered later, which is the behaviour the frontend's
            // `colorIds === undefined` has always had.
            $table->enum('color_mode', ['all', 'list'])->default('all');
            $table->enum('trim_role_mode', ['all', 'list'])->default('all');
            // ['shaft','crown','footL','footR','extra'] when trim_role_mode=list.
            // JSON rather than a pivot: the roles are a closed enum with no
            // table to point at.
            $table->json('trim_roles')->nullable();

            $table->enum('origin', ['builtin', 'bench'])->default('bench');
            // True once a built-in has been re-cut at the bench. Deleting such a
            // row's override is what "restore original" means.
            $table->boolean('overridden')->default(false);
            // A built-in cannot be deleted — its pixels ship in the seed — so it
            // is hidden instead. A bench item is deleted outright.
            $table->boolean('hidden')->default(false);

            $table->unsignedInteger('position')->default(0);

            $table->timestamps();
            $table->index(['hidden', 'position']);
            $table->index('name_uz');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leaves');
    }
};
