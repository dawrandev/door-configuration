<?php

namespace App\Services;

use App\Enums\Origin;
use App\Models\Leaf;
use App\Models\TrimModel;
use App\Repositories\CatalogRepository;
use App\Repositories\CatalogWriteRepository;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Publish a door: the leaf, and the nalichnik and korona traced from the same
 * photograph, as one atomic operation.
 *
 * The bench does this as three independent localStorage writes today
 * (DoorBench.tsx:648, :716, :717), each able to throw on its own — so a door
 * published with one of its two designs is already reachable.
 *
 * ## Why files are written before the transaction
 *
 * Filenames are content hashes, so writing is NON-DESTRUCTIVE: a new hash is a
 * new name and cannot overwrite a file another row still points at. That makes
 * this order safe:
 *
 *     write files -> commit rows -> delete superseded files
 *
 * and it is strictly better than write-to-tmp-then-rename-after-commit, whose
 * bad window leaves committed rows pointing into tmp/ — a visibly broken image.
 * Here the worst case is a file nobody references, which nobody sees and
 * `catalog:sweep-orphans` collects.
 *
 * On failure we go further and delete the files this call newly wrote, so the
 * guarantee is the strong one: a failed publish changes neither the database
 * nor the storage tree. Only NEWLY written files are removed — a path that was
 * already on disk was already referenced by something.
 */
class LeafPublisher
{
    public function __construct(
        private readonly CatalogRepository $catalog,
        private readonly CatalogWriteRepository $repo,
        private readonly CatalogAssets $assets,
    ) {}

    /**
     * @param  array  $payload  the validated `payload` document
     * @param  array<string, UploadedFile|null>  $files  image, source, trimSource
     * @return array{leaf: Leaf, trims: Collection, created: bool}
     */
    public function publish(?string $id, array $payload, array $files): array
    {
        $existing = null;
        if ($id !== null) {
            $existing = $this->catalog->findLeaf($id) ?? throw new ModelNotFoundException("Eshik topilmadi: {$id}");
        }

        $leafId = $existing?->id ?? $this->repo->mintId(Leaf::class);
        $existingTrims = $existing ? $this->catalog->trimsOwnedBy($leafId) : collect();

        // Trim ids are resolved BEFORE any file is written, because each row
        // owns its own directory and the path needs the id.
        //
        // `->get($k)` and never `[$k]`: Collection::offsetGet is a bare
        // `$this->items[$key]`, so `$c[$missing]?->x` raises "undefined array
        // key" — the `?->` guards a null value, not an absent one.
        $trimIds = [];
        foreach ($payload['trims'] ?? [] as $trim) {
            $category = $trim['category'];
            $trimIds[$category] = $existingTrims->get($category)?->id ?? $this->repo->mintId(TrimModel::class);
        }

        /** @var list<string> paths this call created, for cleanup on failure */
        $written = [];
        $supersede = [];

        try {
            $paths = $this->writeFiles($leafId, $trimIds, $payload, $files, $existing, $existingTrims, $written);

            $result = DB::transaction(function () use ($leafId, $existing, $existingTrims, $payload, $paths, $trimIds, &$supersede) {
                return $this->writeRows($leafId, $existing, $existingTrims, $payload, $paths, $trimIds, $supersede);
            });
        } catch (Throwable $e) {
            // Compensating cleanup, so a failed publish leaves the storage tree
            // exactly as it found it. Only paths this call wrote — anything
            // that was already there belongs to some other row.
            foreach ($written as $path) {
                $this->assets->forget($path);
            }

            throw $e;
        }

        // Only after the rows are committed: the old files are unreferenced now
        // and not a moment sooner. Content hashing means `old === new` whenever
        // the pixels did not change, so republishing the same door deletes
        // nothing.
        foreach ($supersede as $path) {
            $this->assets->forget($path);
        }

        return $result;
    }

    /**
     * Put every uploaded file at its final path.
     *
     * The one `trimSource` upload is written into EACH trim's own directory
     * rather than shared. It costs about 100KB and buys a property worth more
     * than that: every file belongs to exactly one row, so "is this file still
     * referenced?" stays a local question. Sharing it would mean republishing
     * only the nalichnik could delete a file the korona still points at.
     *
     * @param  list<string>  $written
     */
    private function writeFiles(string $leafId, array $trimIds, array $payload, array $files, ?Leaf $existing, Collection $existingTrims, array &$written): array
    {
        $put = function (?UploadedFile $file, string $kind, string $id, string $slot) use (&$written): ?string {
            if ($file === null) {
                return null;
            }
            [$path, $isNew] = $this->assets->store($file, $kind, $id, $slot);
            if ($isNew) {
                $written[] = $path;
            }

            return $path;
        };

        // An absent file part PRESERVES what is stored — it does not clear it.
        // Re-cutting a door sends a new `image` but usually no new `source`.
        $paths = [
            'image' => $put($files['image'] ?? null, 'leaves', $leafId, 'image') ?? $existing?->image_path,
            'source' => $put($files['source'] ?? null, 'leaves', $leafId, 'source') ?? $existing?->source_path,
            'trims' => [],
        ];

        foreach ($payload['trims'] ?? [] as $trim) {
            $category = $trim['category'];
            $trimId = $trimIds[$category];
            $paths['trims'][$category] = [
                'trim_source_path' => $put($files['trimSource'] ?? null, 'trims', $trimId, 'trim')
                    ?? $existingTrims->get($category)?->trim_source_path,
                'source_path' => $put($files['source'] ?? null, 'trims', $trimId, 'source')
                    ?? $existingTrims->get($category)?->source_path,
            ];
        }

        return $paths;
    }

    /** @return array{leaf: Leaf, trims: Collection, created: bool} */
    private function writeRows(string $leafId, ?Leaf $existing, Collection $existingTrims, array $payload, array $paths, array $trimIds, array &$supersede): array
    {
        $l = $payload['leaf'];

        $leaf = $this->repo->upsertLeaf($leafId, [
            'name_uz' => trim($l['name']['uz']) ?: 'Eshik',
            'name_kk' => trim($l['name']['kk']) ?: 'Esik',
            'name_ru' => trim($l['name']['ru']) ?: 'Дверь',
            'image_path' => $paths['image'],
            'source_path' => $paths['source'],
            'aspect' => $l['aspect'],
            'handle_side' => $l['handleSide'],
            'handle_swappable' => $l['handleSwappable'],
            'handle_at' => $l['handleAt'] ?? null,
            'corners' => $l['corners'],
            // Omitted preserves; explicit null clears. The bench never sends
            // this, and treating absence as "clear" would silently erase the
            // keep regions of any door that has them the first time it is
            // re-cut (DoorBench.tsx:648-670 never writes it back).
            'keep_regions' => array_key_exists('keep', $l) ? $l['keep'] : $existing?->keep_regions,
            'white' => $l['white'],
            'handle_choice' => $l['handleChoice'],
            'color_mode' => $l['colorMode'],
            'trim_role_mode' => $l['trimRoleMode'],
            'trim_roles' => $l['trimRoleMode'] === 'list' ? $l['trimRoles'] : null,
            'origin' => $existing?->origin ?? Origin::Bench->value,
            // True only when a SHIPPED door is re-cut. A bench door republished
            // is not "overridden" — there is no original behind it.
            'overridden' => $existing?->origin === Origin::Builtin->value,
            // Publishing is an explicit act of putting an item in the
            // catalogue; leaving it hidden would be a no-op the operator has no
            // way to diagnose.
            'hidden' => false,
            'position' => $existing?->position ?? $this->repo->nextPosition('leaves'),
        ]);

        if ($existing?->image_path && $existing->image_path !== $paths['image']) {
            $supersede[] = $existing->image_path;
        }
        if ($existing?->source_path && $existing->source_path !== $paths['source']) {
            $supersede[] = $existing->source_path;
        }

        $this->repo->syncLeafColors($leafId, $l['colorMode'] === 'list' ? $l['colorIds'] : []);

        $trims = collect();
        foreach ($payload['trims'] ?? [] as $t) {
            $category = $t['category'];
            $was = $existingTrims->get($category);
            $label = $category === 'korona' ? 'Korona' : 'Nalichnik';
            $name = trim($t['name']['uz']) ?: $label;

            $trims->push($this->repo->upsertTrimForLeaf($leafId, $category, $trimIds[$category], [
                'name_uz' => $name,
                'name_kk' => trim($t['name']['kk']) ?: $label,
                'name_ru' => trim($t['name']['ru']) ?: $label,
                'trim_margin' => $t['trimMargin'],
                'trim_boxes' => $t['trimBoxes'],
                'trim_source_path' => $paths['trims'][$category]['trim_source_path'],
                'source_path' => $paths['trims'][$category]['source_path'],
                'corners' => $t['corners'] ?? null,
                'origin' => $was?->origin ?? Origin::Bench->value,
                'overridden' => $was?->origin === Origin::Builtin->value,
                'hidden' => false,
                'position' => $was?->position ?? $this->repo->nextPosition('trim_models'),
            ]));

            foreach (['trim_source_path', 'source_path'] as $slot) {
                if ($was?->{$slot} && $was->{$slot} !== $paths['trims'][$category][$slot]) {
                    $supersede[] = $was->{$slot};
                }
            }
        }

        // A category absent from the payload is left completely alone — not
        // deleted, not touched. "A design is independent once it is out in the
        // catalog, and the finish stage says so rather than quietly deleting
        // something a customer may already be choosing." (DoorBench.tsx:695-698)

        return ['leaf' => $leaf->fresh(['colors']), 'trims' => $trims, 'created' => $existing === null];
    }
}
