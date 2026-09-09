<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\TrimResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** A trim design as the bench sees it. */
class AdminTrimResource extends TrimResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'source' => $this->whenNotNull($this->source_path ? Storage::disk('public')->url($this->source_path) : null),
            'corners' => $this->whenNotNull($this->corners),

            // Which door traced this, if any. A standalone design from the trim
            // bench has none. This is the foreign key that replaced the
            // `a-<leafId>-<category>` id convention.
            'ownerLeafId' => $this->owner_leaf_id,

            'origin' => $this->origin,
            'overridden' => (bool) $this->overridden,
            'hidden' => (bool) $this->hidden,
            'position' => (int) $this->position,
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
