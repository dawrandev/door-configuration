<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\LeafResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * A door as the BENCH sees it: everything the showroom gets, plus what is
 * needed to reopen and re-cut it, and to say what state it is in.
 *
 * Extends the public resource rather than restating it, so the contract with
 * kiosk/src/catalog/types.ts is defined in exactly one place and this is a
 * visible delta.
 */
class AdminLeafResource extends LeafResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            // The compact original, so a door can be reopened and re-marked
            // rather than deleted and redone.
            'source' => $this->whenNotNull($this->source_path ? Storage::disk('public')->url($this->source_path) : null),
            'corners' => $this->whenNotNull($this->corners),
            'white' => (bool) $this->white,
            'handleChoice' => $this->handle_choice,

            // The modes as columns, not inferred from a key's absence — see the
            // publish request for why that distinction matters.
            'colorMode' => $this->color_mode,
            'trimRoleMode' => $this->trim_role_mode,

            // What the card badge reads: 'tayyor' / 'tahrirlangan' / 'qo'shilgan',
            // and whether deleting means delete, restore or hide.
            'origin' => $this->origin,
            'overridden' => (bool) $this->overridden,
            'hidden' => (bool) $this->hidden,
            'position' => (int) $this->position,

            // Which designs this door owns. Replaces the client rebuilding
            // `a-<leafId>-<category>` (adminStore.ts:164) — it is what the
            // reopen effect and the orphaned-category warning both need.
            'trims' => $this->whenLoaded('trims', fn () => $this->trims->map(fn ($t) => [
                'id' => $t->id,
                'category' => $t->category,
            ])->values(), []),

            // Moves on a re-cut, which createdAt deliberately does not — so it
            // is the better answer for "most recently touched".
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
