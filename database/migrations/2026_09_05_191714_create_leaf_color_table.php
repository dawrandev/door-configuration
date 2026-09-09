<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which paints a given door model is actually sold in.
 *
 * The one genuinely relational axis in the catalogue, and the only one with a
 * real foreign-key target — which is why it is a pivot table where the trim
 * roles are a JSON array. A JSON list of colour ids would be simpler, but a
 * typo'd id would be undetectable and "which doors wear this paint" would be
 * unanswerable.
 *
 * Empty for a door whose `color_mode` is 'all'. That is not the same as listing
 * every colour: a door on 'all' picks up colours registered later, which is the
 * behaviour `colorIds === undefined` has always had in the frontend.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leaf_color', function (Blueprint $table) {
            $table->string('leaf_id', 64);
            $table->string('color_id', 64);

            $table->primary(['leaf_id', 'color_id']);
            $table->foreign('leaf_id')->references('id')->on('leaves')->cascadeOnDelete();
            $table->foreign('color_id')->references('id')->on('door_colors')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leaf_color');
    }
};
