<?php

namespace App\Services;

use App\Enums\Origin;
use App\Models\Room;
use App\Repositories\CatalogRepository;
use App\Repositories\CatalogWriteRepository;
use App\Services\Concerns\PublishesAtomically;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\UploadedFile;

/**
 * Publish a room: one row and two images.
 *
 * Simpler than a door — there are no owned designs to keep in step — but the
 * same file/transaction ordering applies, so the failure guarantees are the
 * same. See PublishesAtomically.
 */
class RoomPublisher
{
    use PublishesAtomically;

    public function __construct(
        private readonly CatalogRepository $catalog,
        private readonly CatalogWriteRepository $repo,
        private readonly CatalogAssets $assets,
    ) {}

    protected function assets(): CatalogAssets
    {
        return $this->assets;
    }

    /**
     * @param  array<string, UploadedFile|null>  $files
     * @return array{room: Room, created: bool}
     */
    public function publish(?string $id, array $payload, array $files): array
    {
        $this->beginPublish();

        $existing = $id === null
            ? null
            : ($this->catalog->findRoom($id) ?? throw new ModelNotFoundException("Xona topilmadi: {$id}"));

        $roomId = $existing?->id ?? $this->repo->mintId(Room::class);

        $imagePath = $this->stage($files['image'] ?? null, 'rooms', $roomId, 'image') ?? $existing?->image_path;
        $sourcePath = $this->stage($files['source'] ?? null, 'rooms', $roomId, 'source') ?? $existing?->source_path;

        /**
         * The thumbnail IS the source.
         *
         * RoomBench assigns the same string to both (RoomBench.tsx:336, :350):
         * the compact untouched photo, door and all. Uploading it twice would
         * cost another ~200KB for two identical files, and content hashing
         * would land them on the same bytes anyway.
         *
         * The distinction that matters is against `image`, not against
         * `source`: recolorTrim deliberately crops the trim's lighting from
         * `thumb ?? image` (recolor.ts:462) because `image` has an unlit recess
         * where the doorway is, and blurring that into the estimate washes the
         * casing out.
         */
        $thumbPath = $sourcePath;

        return $this->commitAndSettle(function () use ($roomId, $existing, $payload, $imagePath, $sourcePath, $thumbPath) {
            $r = $payload['room'];

            $room = $this->repo->upsertRoom($roomId, [
                'name_uz' => trim($r['name']['uz']) ?: 'Xona',
                'name_kk' => trim($r['name']['kk']) ?: 'Bólme',
                'name_ru' => trim($r['name']['ru']) ?: 'Комната',
                'image_path' => $imagePath,
                'thumb_path' => $thumbPath,
                'source_path' => $sourcePath,
                'aspect' => $r['aspect'],
                'open' => $r['open'],
                // Absent means the room has no measured architrave, which is a
                // real state — a flush modern doorway has none.
                'trim_boxes' => $r['trimBoxes'] ?? null,
                'light' => $r['light'],
                'box' => $r['box'] ?? $r['open'],
                'origin' => $existing?->origin ?? Origin::Bench->value,
                'overridden' => $existing?->origin === Origin::Builtin->value,
                'hidden' => false,
                'position' => $existing?->position ?? $this->repo->nextPosition('rooms'),
            ]);

            $this->supersede($existing?->image_path, $imagePath);
            $this->supersede($existing?->source_path, $sourcePath);
            $this->supersede($existing?->thumb_path, $thumbPath);

            return ['room' => $room, 'created' => $existing === null];
        });
    }
}
