<?php

namespace App\Http\Requests\Admin;

use App\Enums\TrimCategory;
use App\Enums\TrimRole;
use App\Http\Requests\Concerns\DecodesJsonPayload;
use App\Http\Requests\Rules\Geometry;
use App\Services\CatalogAssets;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Publishing a door: the leaf, and the nalichnik and/or korona traced from the
 * same photograph, in one request.
 *
 * The frontend does this as three independent localStorage writes today
 * (DoorBench.tsx:648, :716, :717), each able to fail on its own — so a door can
 * already end up published with one of its two designs. One request, one
 * transaction.
 */
class PublishLeafRequest extends FormRequest
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
                'payload.leaf' => ['required', 'array'],

                'payload.leaf.aspect' => ['required', 'numeric', 'between:0.05,20'],
                'payload.leaf.handleSide' => ['required', 'in:left,right'],
                'payload.leaf.handleSwappable' => ['required', 'boolean'],
                'payload.leaf.handleAt' => ['nullable', 'array', 'required_if:payload.leaf.handleSwappable,true'],
                'payload.leaf.handleAt.x' => ['required_with:payload.leaf.handleAt', 'numeric', 'between:0,1'],
                'payload.leaf.handleAt.y' => ['required_with:payload.leaf.handleAt', 'numeric', 'between:0,1'],
                'payload.leaf.white' => ['required', 'boolean'],
                'payload.leaf.handleChoice' => ['required', 'in:left,right,none'],

                // Omitted preserves whatever is stored; explicit null clears it.
                // The bench never sends it — publishNow does not write `keep`
                // back (DoorBench.tsx:648-670) — so re-cutting a door that has
                // keep regions would erase them if absence meant "clear".
                'payload.leaf.keep' => ['sometimes', 'nullable', 'array', 'max:32'],
                'payload.leaf.keep.*.x' => Geometry::coordinate(),
                'payload.leaf.keep.*.y' => Geometry::coordinate(),
                'payload.leaf.keep.*.w' => Geometry::extent(),
                'payload.leaf.keep.*.h' => Geometry::extent(),

                // An explicit mode rather than key-presence. An absent colorIds
                // means "every colour, including ones registered later", which
                // is NOT the same as an empty list — and a distinction that
                // subtle deserves a column rather than an absence.
                'payload.leaf.colorMode' => ['required', 'in:all,list'],
                'payload.leaf.colorIds' => ['required_if:payload.leaf.colorMode,list', 'array'],
                'payload.leaf.colorIds.*' => ['string', 'max:64', 'distinct', 'exists:door_colors,id'],
                'payload.leaf.trimRoleMode' => ['required', 'in:all,list'],
                'payload.leaf.trimRoles' => ['required_if:payload.leaf.trimRoleMode,list', 'array'],
                'payload.leaf.trimRoles.*' => ['distinct', Rule::enum(TrimRole::class)],

                // At most two: one design per category.
                'payload.trims' => ['sometimes', 'array', 'max:2'],
                'payload.trims.*.category' => ['required', 'distinct', Rule::enum(TrimCategory::class)],
                'payload.trims.*.trimBoxes' => ['required', 'array', 'min:1', 'max:'.Geometry::MAX_PIECES],

                'image' => [$replacing ? 'sometimes' : 'required', 'file', $mimes, 'max:40960'],
                'source' => ['nullable', 'file', $mimes, 'max:16384'],
                // One file for both designs — the bench encodes it once
                // (DoorBench.tsx:688) and hands it to each category.
                'trimSource' => ['required_with:payload.trims', 'file', $mimes, 'max:16384'],
            ],
            Geometry::name('payload.leaf.name'),
            Geometry::corners('payload.leaf.corners'),
            Geometry::outline('payload.leaf.shape'),
            Geometry::name('payload.trims.*.name'),
            Geometry::margin('payload.trims.*.trimMargin'),
            Geometry::corners('payload.trims.*.corners', required: false),
            Geometry::piece('payload.trims.*.trimBoxes.*'),
        );
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            foreach ((array) $this->input('payload.trims', []) as $i => $trim) {
                $category = TrimCategory::tryFrom($trim['category'] ?? '');
                if ($category === null) {
                    continue;
                }

                foreach ((array) ($trim['trimBoxes'] ?? []) as $j => $box) {
                    $role = TrimRole::tryFrom($box['role'] ?? '');

                    // The split the frontend makes (DoorBench.tsx:26, :691-692):
                    // a crown is the korona, everything else is the nalichnik.
                    // Enforced rather than re-implemented, so a client that
                    // splits them wrongly is refused instead of producing a
                    // korona full of shaft pieces.
                    if ($role !== null && $role->category() !== $category) {
                        $validator->errors()->add(
                            "payload.trims.{$i}.trimBoxes.{$j}.role",
                            "Rol '{$role->value}' '{$category->value}' dizayniga tegishli emas."
                        );
                    }
                }
            }
        });
    }
}
