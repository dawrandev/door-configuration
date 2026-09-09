<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\RenameItemRequest;
use App\Repositories\CatalogRepository;
use App\Repositories\CatalogWriteRepository;
use App\Services\CatalogItemRemover;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;

/**
 * Renaming, deleting and unhiding — for doors, rooms and trim designs alike.
 *
 * One controller with a `{kind}` segment rather than the same three methods
 * copied into three controllers. Publishing genuinely differs per kind (a door
 * writes its designs too, a room derives its thumbnail); these three do not
 * differ at all, and duplicating them would be three chances to fix a bug twice.
 */
class CatalogItemController extends Controller
{
    /** The kinds this controller serves, and the label an error uses. */
    private const LABELS = [
        'leaves' => 'Eshik',
        'rooms' => 'Xona',
        'trims' => 'Nalichnik',
    ];

    public function __construct(
        private readonly CatalogRepository $catalog,
        private readonly CatalogWriteRepository $repo,
        private readonly CatalogItemRemover $remover,
    ) {}

    public function rename(RenameItemRequest $request, string $kind, string $id): JsonResponse
    {
        $item = $this->find($kind, $id);
        $name = $request->validated('name');

        $this->repo->rename($item, trim($name['uz']), trim($name['kk']), trim($name['ru']));

        return response()->json([
            'version' => $this->catalog->version(),
            'item' => $this->summarise($item->fresh()),
        ]);
    }

    /**
     * Delete, restore or hide, depending on what the item is.
     *
     * The three answers are genuinely different outcomes, so the response says
     * which one happened rather than making the bench guess from a 204.
     */
    public function destroy(string $kind, string $id): JsonResponse
    {
        $result = $this->remover->remove($kind, $this->find($kind, $id));

        if ($result['action'] === 'restored' && ! $result['restored']) {
            return response()->json([
                'message' => 'Bu element uchun zavod nusxasi yo‘q.',
                'code' => 'NO_FACTORY_COPY',
            ], 409);
        }

        return response()->json([
            'version' => $this->catalog->version(),
            'action' => $result['action'],
            // Designs that outlived the door that traced them. The bench tells
            // the operator so they are not left wondering where they came from.
            'orphanedTrims' => $result['orphanedTrims'],
        ]);
    }

    public function unhide(string $kind, string $id): JsonResponse
    {
        $item = $this->find($kind, $id);

        if (! $item->hidden) {
            // The caller is working from a stale list and should refetch rather
            // than be told nothing happened.
            return response()->json([
                'message' => 'Bu element allaqachon ko‘rinadi.',
                'code' => 'NOT_HIDDEN',
            ], 409);
        }

        $this->remover->unhide($item);

        return response()->json([
            'version' => $this->catalog->version(),
            'action' => 'unhidden',
            'item' => $this->summarise($item->fresh()),
        ]);
    }

    private function find(string $kind, string $id): Model
    {
        $item = match ($kind) {
            'leaves' => $this->catalog->findLeaf($id),
            'rooms' => $this->catalog->findRoom($id),
            'trims' => $this->catalog->findTrim($id),
        };

        return $item ?? throw new ModelNotFoundException(self::LABELS[$kind].' topilmadi: '.$id);
    }

    /** Enough for the bench to update one card without refetching the list. */
    private function summarise(Model $item): array
    {
        return [
            'id' => $item->getKey(),
            'name' => ['uz' => $item->name_uz, 'kk' => $item->name_kk, 'ru' => $item->name_ru],
            'origin' => $item->origin,
            'overridden' => (bool) $item->overridden,
            'hidden' => (bool) $item->hidden,
        ];
    }
}
