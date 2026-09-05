<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Rules\Geometry;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Registering a paint.
 *
 * Add-only: there is no update and no delete, matching the store the bench has
 * always had (adminStore.ts:189-193). Once a shade is mixed and named there is
 * no reason to take it away from a door already wearing it.
 */
class StoreColorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // the route carries auth + can:bench
    }

    public function rules(): array
    {
        return array_merge(
            // Same shape the bench validates before it will enable its button
            // (DoorBench.tsx:372).
            ['hex' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/']],
            Geometry::name('name'),
        );
    }
}
