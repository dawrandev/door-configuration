<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A paint, shaped exactly like `DoorColor` in kiosk/src/catalog/colors.ts. */
class ColorResource extends JsonResource
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
            'hex' => $this->hex,
        ];
    }
}
