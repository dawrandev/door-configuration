<?php

namespace App\Http\Requests\Admin;

use App\Enums\TrimCategory;
use App\Http\Requests\Concerns\DecodesJsonPayload;
use App\Http\Requests\Rules\Geometry;
use App\Services\CatalogAssets;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Publishing a standalone nalichnik or korona design — one the customer picks
 * independently of any door or room.
 *
 * Unlike a door's own trim, the ROLE of a piece is not constrained by the
 * category here. The trim bench lets an operator move a design between the two
 * (TrimBench.tsx:350-354), and its pieces are traced against a bare opening
 * rather than split out of a door's trace, so a korona built from pieces
 * labelled `shaft` is the operator's call to make.
 */
class PublishTrimRequest extends FormRequest
{
    use DecodesJsonPayload;

    public function authorize(): bool
    {
        return true; // the route carries auth + can:bench
    }

    public function rules(): array
    {
        $mimes = 'mimetypes:'.implode(',', CatalogAssets::MIMES);
        $replacing = $this->route('id') !== null;

        return array_merge(
            [
                'payload' => ['required', 'array'],
                'payload.trim' => ['required', 'array'],
                'payload.trim.category' => ['required', Rule::enum(TrimCategory::class)],
                'payload.trim.trimBoxes' => ['required', 'array', 'min:1', 'max:'.Geometry::MAX_PIECES],

                // WebP with a real alpha channel, or PNG where the browser
                // cannot encode WebP. It must NOT be re-encoded to a format
                // without alpha: the margin is genuinely transparent wherever
                // the photograph did not reach, and a JPEG composites that onto
                // black (rectify.ts:228-238).
                'trimSource' => [$replacing ? 'sometimes' : 'required', 'file', $mimes, 'max:16384'],
                'source' => ['nullable', 'file', $mimes, 'max:16384'],
            ],
            Geometry::name('payload.trim.name'),
            Geometry::margin('payload.trim.trimMargin'),
            Geometry::corners('payload.trim.corners', required: false),
            Geometry::piece('payload.trim.trimBoxes.*'),
        );
    }
}
