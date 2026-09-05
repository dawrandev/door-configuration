<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\DecodesJsonPayload;
use App\Http\Requests\Rules\Geometry;
use App\Services\CatalogAssets;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Publishing a room: an interior photograph, the doorway marked on it, and
 * however many pieces of architrave the photo actually shows.
 */
class PublishRoomRequest extends FormRequest
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
                'payload.room' => ['required', 'array'],

                // 5 decimal places here, unlike the leaf's 4 — roomProcess.ts:81.
                'payload.room.aspect' => ['required', 'numeric', 'between:0.05,20'],

                // The doorway. Its x/y can leave [0,1] the same way trim
                // geometry can — `nudgeOpen` (RoomBench.tsx:204) is unclamped —
                // but width and height must be positive or processRoom cannot
                // paint a recess at all.
                'payload.room.open' => ['required', 'array'],
                'payload.room.open.x' => Geometry::coordinate(),
                'payload.room.open.y' => Geometry::coordinate(),
                'payload.room.open.w' => ['required', 'numeric', 'gt:0', 'max:3'],
                'payload.room.open.h' => ['required', 'numeric', 'gt:0', 'max:3'],

                // The doorway box as the bench last had it. Usually identical to
                // `open`; kept separately so reopening restores the operator's
                // own rectangle rather than a derived one.
                'payload.room.box' => ['nullable', 'array'],
                'payload.room.box.x' => ['required_with:payload.room.box', 'numeric', 'between:-1,2'],
                'payload.room.box.y' => ['required_with:payload.room.box', 'numeric', 'between:-1,2'],
                'payload.room.box.w' => ['required_with:payload.room.box', 'numeric', 'gt:0', 'max:3'],
                'payload.room.box.h' => ['required_with:payload.room.box', 'numeric', 'gt:0', 'max:3'],

                // The room's own light as an RGB multiplier. roomProcess.ts:53-56
                // takes a median and falls back to 1, so it is never zero and
                // never NaN; real photographs land near 1.
                'payload.room.light' => ['required', 'array', 'size:3'],
                'payload.room.light.*' => ['required', 'numeric', 'between:0.1,10'],

                // Absent when the room has no measured architrave — not [].
                'payload.room.trimBoxes' => ['nullable', 'array', 'max:'.Geometry::MAX_PIECES],

                // The stage image, with the doorway already replaced by an unlit
                // recess. It is encoded at the photograph's full camera
                // resolution today (roomProcess.ts:26-30 does not downscale), so
                // the ceiling is generous on purpose.
                'image' => [$replacing ? 'sometimes' : 'required', 'file', $mimes, 'max:40960'],
                // The untouched photo. It doubles as the chooser thumbnail —
                // RoomBench.tsx:336 and :350 assign the same string to both — so
                // there is no separate thumb part to upload.
                'source' => ['nullable', 'file', $mimes, 'max:16384'],
            ],
            Geometry::name('payload.room.name'),
            Geometry::piece('payload.room.trimBoxes.*'),
        );
    }
}
