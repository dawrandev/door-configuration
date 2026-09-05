<?php

namespace App\Services;

use App\Enums\Origin;
use App\Models\TrimModel;
use App\Repositories\CatalogWriteRepository;
use Database\Seeders\CatalogSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Deleting a catalogue item: one rule, three arms.
 *
 * This reproduces `removeLeaf` (adminStore.ts:102-113), which the bench states
 * as "drop the bench entry if there is one, else hide". The three cases are the
 * same; what decides them is now the `origin` and `overridden` columns rather
 * than an `a-` prefix on the id.
 *
 *   bench item                → deleted outright, files and all
 *   re-cut built-in           → the shipped version is written back
 *                               ("Aslini qaytarish" — the same button)
 *   untouched built-in        → hidden; its pixels ship in the seed and there
 *                               is nothing to delete
 *
 * The asymmetry is deliberate and matches the bench: after restoring a built-in
 * the card reads "tayyor" again, so the NEXT press of the same button hides it
 * instead.
 */
class CatalogItemRemover
{
    public function __construct(
        private readonly CatalogWriteRepository $repo,
        private readonly CatalogAssets $assets,
        private readonly CatalogSeeder $seeder,
    ) {}

    /**
     * @return array{action: string, restored: bool, orphanedTrims: list<string>}
     */
    public function remove(string $kind, Model $item): array
    {
        if ($item->origin === Origin::Bench->value) {
            return $this->deleteOutright($kind, $item);
        }

        if ($item->overridden) {
            return [
                'action' => 'restored',
                'restored' => $this->seeder->restoreOne($kind, $item->getKey()),
                'orphanedTrims' => [],
            ];
        }

        $this->repo->setHidden($item, true);

        return ['action' => 'hidden', 'restored' => false, 'orphanedTrims' => []];
    }

    /** Bring a hidden built-in back. There is no bench control for this — the
     *  route exists so hiding is reversible without a database console. */
    public function unhide(Model $item): void
    {
        $this->repo->setHidden($item, false);
    }

    private function deleteOutright(string $kind, Model $item): array
    {
        $id = $item->getKey();

        /**
         * Designs this door traced SURVIVE it.
         *
         * The foreign key is nullOnDelete, so they stay in the catalogue with
         * their own files and simply stop naming an owner. That matches the
         * bench — nothing in `removeLeaf` touches the trim store — and the
         * reasoning is the same one the door bench gives for not deleting a
         * design a publish did not mention: a customer may be choosing it.
         */
        $orphaned = $kind === 'leaves'
            ? TrimModel::where('owner_leaf_id', $id)->pluck('id')->all()
            : [];

        DB::transaction(fn () => $this->repo->delete($item));

        // After the row is gone, and only then.
        $this->assets->forgetDirectory($kind, $id);

        return ['action' => 'deleted', 'restored' => false, 'orphanedTrims' => $orphaned];
    }
}
