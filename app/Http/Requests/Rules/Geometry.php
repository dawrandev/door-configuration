<?php

namespace App\Http\Requests\Rules;

use App\Enums\TrimRole;
use Illuminate\Validation\Rule;

/**
 * The shared geometry rules. Used for a room's trim and for a door's, so the
 * two cannot drift apart.
 *
 * COORDINATES ARE NOT BOUNDED TO [0,1], and a rule saying otherwise would
 * reject work an operator legitimately did. Dragging a point IS clamped
 * (DoorBench.tsx:485, RoomBench.tsx:192), but four paths are not:
 *
 *   - the nudge arrows shift every point by ±8px with no clamp at all
 *     (DoorBench.tsx:532-541, TrimBench.tsx:186-195, RoomBench.tsx:213-222),
 *     and those arrows are a normal gesture, not an edge case;
 *   - `remapPieces` (DoorBench.tsx:121-132) re-expresses a stored outline
 *     against a new reveal on reopen, which a shrinking margin pushes negative;
 *   - `defaultRectFor('shaft')` (trimGeometry.ts:98) reaches ref.x+ref.w+0.03,
 *     past 1 whenever the opening sits near the right edge;
 *   - `nudgeOpen` (RoomBench.tsx:204) does the same to the doorway box itself.
 *
 * So the bound is wide enough to accept any of that and tight enough to reject
 * NaN, 1e30 and garbage — anything past it is a bench bug that should 422
 * rather than be persisted into the renderer.
 */
class Geometry
{
    /** How far outside the image a legitimate nudge can push a point. */
    public const MIN = -1;

    public const MAX = 2;

    /** A point count no honest trace reaches; a runaway loop would. */
    public const MAX_POINTS = 400;

    public const MAX_PIECES = 32;

    /** @return array<string, mixed> */
    public static function coordinate(): array
    {
        return ['required', 'numeric', 'between:'.self::MIN.','.self::MAX];
    }

    /** Widths and heights come from `bboxOfPoints`, so they can be zero for a
     *  collinear trace but never negative (trimGeometry.ts:35-40). */
    public static function extent(): array
    {
        return ['required', 'numeric', 'min:0', 'max:3'];
    }

    /**
     * The rules for one TrimPiece, under the given dotted prefix.
     *
     * `points` is REQUIRED rather than defaulted from the rect. Seeding it
     * server-side would silently accept a bench that lost the trace, and the
     * operator would find a rectangle where they had cut a moulding.
     *
     * @return array<string, mixed>
     */
    public static function piece(string $prefix): array
    {
        return [
            $prefix => ['required', 'array'],
            "{$prefix}.x" => self::coordinate(),
            "{$prefix}.y" => self::coordinate(),
            "{$prefix}.w" => self::extent(),
            "{$prefix}.h" => self::extent(),

            // At least 3: below that it is not a shape, and both the bench
            // (DoorBench.tsx:527) and the renderer (recolor.ts:427) refuse it.
            "{$prefix}.points" => ['required', 'array', 'min:3', 'max:'.self::MAX_POINTS],
            "{$prefix}.points.*.x" => self::coordinate(),
            "{$prefix}.points.*.y" => self::coordinate(),

            // Absent unless actually traced — never [] (trimGeometry.ts:132).
            "{$prefix}.holePoints" => ['nullable', 'array', 'min:3', 'max:'.self::MAX_POINTS],
            "{$prefix}.holePoints.*.x" => self::coordinate(),
            "{$prefix}.holePoints.*.y" => self::coordinate(),

            "{$prefix}.role" => ['required', Rule::enum(TrimRole::class)],
            "{$prefix}.label" => ['nullable', 'string', 'max:120'],
        ];
    }

    /**
     * The margin revealing the casing around an opening.
     *
     * This one IS provably bounded: `photoMargin` ends with
     * `Math.min(1.5, Math.max(0, …))` (rectify.ts:223-225).
     */
    public static function margin(string $prefix): array
    {
        $rule = ['required', 'numeric', 'between:0,1.5'];

        return [
            $prefix => ['required', 'array'],
            "{$prefix}.left" => $rule,
            "{$prefix}.right" => $rule,
            "{$prefix}.top" => $rule,
            "{$prefix}.bottom" => $rule,
        ];
    }

    /** The four marked corners: top-left, top-right, bottom-right, bottom-left.
     *  The ORDER is load-bearing — the homography maps them positionally. */
    public static function corners(string $prefix, bool $required = true): array
    {
        return [
            $prefix => [$required ? 'required' : 'nullable', 'array', 'size:4'],
            "{$prefix}.*.x" => self::coordinate(),
            "{$prefix}.*.y" => self::coordinate(),
        ];
    }

    /**
     * A free outline: the door's own silhouette, or anything else traced as a
     * single closed loop rather than solved as a homography.
     *
     * Unlike `corners` this has no fixed count and no load-bearing order — it
     * is a polygon, and the bench adds and removes points along it freely.
     * Three is the floor for the same reason a trim piece's is: below that it
     * encloses no area at all.
     *
     * @return array<string, mixed>
     */
    public static function outline(string $prefix): array
    {
        return [
            $prefix => ['nullable', 'array', 'min:3', 'max:'.self::MAX_POINTS],
            "{$prefix}.*.x" => self::coordinate(),
            "{$prefix}.*.y" => self::coordinate(),
        ];
    }

    /** A three-language name. */
    public static function name(string $prefix): array
    {
        return [
            $prefix => ['required', 'array'],
            "{$prefix}.uz" => ['required', 'string', 'max:160'],
            "{$prefix}.kk" => ['required', 'string', 'max:160'],
            "{$prefix}.ru" => ['required', 'string', 'max:160'],
        ];
    }
}
