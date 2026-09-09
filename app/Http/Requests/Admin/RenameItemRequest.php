<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Rules\Geometry;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Renaming a catalogue item from the bench list.
 *
 * The full three-language name, not a bare string. The bench card sends the
 * same value three times today — the old edits overlay replaced all three
 * languages with one string (adminStore.ts:218) — but accepting a string would
 * hide from the API that three columns exist and would block naming a door
 * differently per language later.
 *
 * Only the name. `hidden` is reached through DELETE and /unhide, which say what
 * they do; and `handleSide`, which the old Edit type allowed, is not accepted:
 * no bench control has ever written it, and a door's handle side comes from the
 * pipeline or a re-cut, not from a list screen.
 */
class RenameItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // the route carries auth + can:bench
    }

    public function rules(): array
    {
        return Geometry::name('name');
    }
}
