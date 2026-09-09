<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\RoomResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** A room as the bench sees it. */
class AdminRoomResource extends RoomResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            // The compact untouched photo, so the doorway and its trim can be
            // re-marked. Usually the same file the public `thumb` points at.
            'source' => $this->whenNotNull($this->source_path ? Storage::disk('public')->url($this->source_path) : null),
            // The doorway rectangle as the operator last had it, which reopening
            // restores in preference to the derived `open`.
            'box' => $this->whenNotNull($this->box),

            'origin' => $this->origin,
            'overridden' => (bool) $this->overridden,
            'hidden' => (bool) $this->hidden,
            'position' => (int) $this->position,
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
