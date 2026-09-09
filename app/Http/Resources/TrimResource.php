<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** A trim design, shaped exactly like `TrimModel` in kiosk/src/catalog/types.ts. */
class TrimResource extends JsonResource
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
            'category' => $this->category,
            'trimMargin' => $this->trim_margin,
            'trimBoxes' => $this->trim_boxes,
            'trimSource' => Storage::disk('public')->url($this->trim_source_path),
        ];
    }
}
