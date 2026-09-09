<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The door's own silhouette, traced on the rectified leaf.
 *
 * `corners` cannot answer this. Those four points are not an outline — they
 * are the correspondences the 8-DoF homography is solved from (rectify.ts:22),
 * so there are exactly four of them and a fifth has nowhere to go. They say
 * WHICH quadrilateral of the photograph is the door face; they cannot say that
 * the face is arched at the top, or that its edge is not straight.
 *
 * This does. Points are fractions of the RECTIFIED leaf, so they stay put when
 * a corner is nudged — the space is defined by the corners themselves — and
 * the mask is applied at publish time, leaving the stored image with alpha the
 * renderer already knows how to handle (derivePasses weights by alpha and
 * compositeToCanvas carries the source's own).
 *
 * Null for every door that is simply a rectangle, which is most of them, and
 * for every door published before this existed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leaves', function (Blueprint $table) {
            $table->json('shape')->nullable()->after('corners');
        });
    }

    public function down(): void
    {
        Schema::table('leaves', function (Blueprint $table) {
            $table->dropColumn('shape');
        });
    }
};
