<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** A room, shaped exactly like `Room` in kiosk/src/catalog/types.ts. */
class RoomResource extends JsonResource
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
            // The stage image: doorway replaced by an unlit recess.
            'image' => Storage::disk('public')->url($this->image_path),
            // The untouched photo. The chooser shows it, and the trim's lighting
            // is derived from it — cropping the recess into that estimate is
            // what washed the casing out.
            'thumb' => $this->whenNotNull($this->thumb_path ? Storage::disk('public')->url($this->thumb_path) : null),
            'aspect' => (float) $this->aspect,
            'open' => $this->open,
            'trimBoxes' => $this->whenNotNull($this->trim_boxes),
            'light' => $this->light,
        ];
    }
}
