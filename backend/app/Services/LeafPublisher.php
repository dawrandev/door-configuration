<?php

namespace App\Services;

use App\Enums\Origin;
use App\Models\Leaf;
use App\Models\TrimModel;
use App\Repositories\CatalogRepository;
use App\Repositories\CatalogWriteRepository;
use App\Services\Concerns\PublishesAtomically;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;

/**
 * Publish a door: the leaf, and the nalichnik and korona traced from the same
 * photograph, as one atomic operation.
 *
 * The bench does this as three independent localStorage writes today
 * (DoorBench.tsx:648, :716, :717), each able to throw on its own — so a door
 * published with one of its two designs is already reachable.
 *
 * The file/transaction ordering and its failure guarantees live in
 * PublishesAtomically.
 */
class LeafPublisher
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
     * @param  array  $payload  the validated `payload` document
     * @param  array<string, UploadedFile|null>  $files
     * @return array{leaf: Leaf, trims: Collection, created: bool}
     */
    public function publish(?string $id, array $payload, array $files): array
    {
        $this->beginPublish();

        $existing = $id === null
            ? null
            : ($this->catalog->findLeaf($id) ?? throw new ModelNotFoundException("Eshik topilmadi: {$id}"));

        $leafId = $existing?->id ?? $this->repo->mintId(Leaf::class);
        $existingTrims = $existing ? $this->catalog->trimsOwnedBy($leafId) : collect();

        // Trim ids are resolved BEFORE any file is written, because each design
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

        $paths = $this->stageFiles($leafId, $trimIds, $payload, $files, $existing, $existingTrims);

        return $this->commitAndSettle(
            fn () => $this->writeRows($leafId, $existing, $existingTrims, $payload, $paths, $trimIds)
        );
    }

    /**
     * The one `trimSource` upload is written into EACH design's own directory
     * rather than shared between them. It costs about 100KB and buys a property
     * worth more: every file belongs to exactly one row, so "is this file still
     * referenced?" stays a local question. Sharing it would mean republishing
     * only the nalichnik could delete a file the korona still points at.
     */
    private function stageFiles(string $leafId, array $trimIds, array $payload, array $files, ?Leaf $existing, Collection $existingTrims): array
    {
        $paths = [
            'image' => $this->stage($files['image'] ?? null, 'leaves', $leafId, 'image') ?? $existing?->image_path,
            'source' => $this->stage($files['source'] ?? null, 'leaves', $leafId, 'source') ?? $existing?->source_path,
            'trims' => [],
        ];

        foreach ($payload['trims'] ?? [] as $trim) {
            $category = $trim['category'];
            $trimId = $trimIds[$category];
            $was = $existingTrims->get($category);

            $paths['trims'][$category] = [
                'trim_source_path' => $this->stage($files['trimSource'] ?? null, 'trims', $trimId, 'trim')
                    ?? $was?->trim_source_path,
                'source_path' => $this->stage($files['source'] ?? null, 'trims', $trimId, 'source')
                    ?? $was?->source_path,
            ];
        }

        return $paths;
    }

    /** @return array{leaf: Leaf, trims: Collection, created: bool} */
    private function writeRows(string $leafId, ?Leaf $existing, Collection $existingTrims, array $payload, array $paths, array $trimIds): array
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

        $this->supersede($existing?->image_path, $paths['image']);
        $this->supersede($existing?->source_path, $paths['source']);

        $this->repo->syncLeafColors($leafId, $l['colorMode'] === 'list' ? $l['colorIds'] : []);

        $trims = collect();
        foreach ($payload['trims'] ?? [] as $t) {
            $category = $t['category'];
            $was = $existingTrims->get($category);
            $label = $category === 'korona' ? 'Korona' : 'Nalichnik';

            $trims->push($this->repo->upsertTrimForLeaf($leafId, $category, $trimIds[$category], [
                'name_uz' => trim($t['name']['uz']) ?: $label,
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

            $this->supersede($was?->trim_source_path, $paths['trims'][$category]['trim_source_path']);
            $this->supersede($was?->source_path, $paths['trims'][$category]['source_path']);
        }

        // A category absent from the payload is left completely alone — not
        // deleted, not touched. "A design is independent once it is out in the
        // catalog, and the finish stage says so rather than quietly deleting
        // something a customer may already be choosing." (DoorBench.tsx:695-698)

        return ['leaf' => $leaf->fresh(['colors', 'trims']), 'trims' => $trims, 'created' => $existing === null];
    }
}
