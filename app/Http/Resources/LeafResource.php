<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * A door, shaped exactly like `Leaf` in kiosk/src/catalog/types.ts.
 *
 * That interface is the contract, and it is a strict one: several of its fields
 * are optional in the sense that ABSENT means something specific and different
 * from a value. `colorIds` undefined is "sold in every colour, including ones
 * registered later"; an empty array would mean "sold in none". So those keys are
 * OMITTED via whenNotNull / when, never emitted as null.
 *
 * Bench-only fields (source, corners, white, handleChoice) are not here. The
 * showroom never reads them and they roughly double the payload; the admin
 * resource carries them.
 */
class LeafResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => [
                'uz' => $this->name_uz,
                'kk' => $this->name_kk,
                'ru' => $this->name_ru,
            ],
            'image' => Storage::disk('public')->url($this->image_path),
            'aspect' => (float) $this->aspect,
            'handleSide' => $this->handle_side,
            'handleSwappable' => (bool) $this->handle_swappable,
            'handleAt' => $this->whenNotNull($this->handle_at),
            'keep' => $this->whenNotNull($this->keep_regions),
            // 'list' with an empty pivot would be a door sold in no colours at
            // all, which is a real (if odd) thing to say; 'all' is the absence
            // of the field entirely.
            'colorIds' => $this->when(
                $this->color_mode === 'list',
                fn () => $this->colors->pluck('id')->all()
            ),
            'trimRoles' => $this->when($this->trim_role_mode === 'list', fn () => $this->trim_roles),
        ];
    }
}
