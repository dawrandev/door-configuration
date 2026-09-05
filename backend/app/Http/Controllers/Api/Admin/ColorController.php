<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\Origin;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreColorRequest;
use App\Http\Resources\ColorResource;
use App\Models\DoorColor;
use App\Repositories\CatalogRepository;
use App\Repositories\CatalogWriteRepository;
use Illuminate\Http\JsonResponse;

class ColorController extends Controller
{
    public function __construct(
        private readonly CatalogRepository $catalog,
        private readonly CatalogWriteRepository $repo,
    ) {}

    /**
     * Register a paint.
     *
     * Its own endpoint, not part of publishing a door: the bench registers a
     * colour the moment it is named, before the door that prompted it is
     * finished (DoorBench.tsx:371-388). A door then references it by id.
     */
    public function store(StoreColorRequest $request): JsonResponse
    {
        $name = $request->validated('name');

        $color = $this->repo->createColor($this->repo->mintId(DoorColor::class), [
            'name_uz' => trim($name['uz']),
            'name_kk' => trim($name['kk']),
            'name_ru' => trim($name['ru']),
            'hex' => strtoupper($request->validated('hex')),
            'origin' => Origin::Bench->value,
            'position' => $this->repo->nextPosition('door_colors'),
        ]);

        return response()->json([
            'version' => $this->catalog->version(),
            'color' => new ColorResource($color),
        ], 201);
    }
}
