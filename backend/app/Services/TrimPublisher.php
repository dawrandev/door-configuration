<?php

namespace App\Services;

use App\Enums\Origin;
use App\Models\TrimModel;
use App\Repositories\CatalogRepository;
use App\Repositories\CatalogWriteRepository;
use App\Services\Concerns\PublishesAtomically;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\UploadedFile;

/**
 * Publish a standalone trim design — one the trim bench authored on its own
 * photograph, belonging to no particular door.
 *
 * A design a DOOR traced comes through LeafPublisher instead, and carries
 * `owner_leaf_id`. Reopening one of those in the trim bench and republishing it
 * here is allowed and deliberately does not clear that link: the door still
 * traced it, and the orphaned-design warning on the door bench depends on the
 * association surviving an edit.
 */
class TrimPublisher
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
     * @return array{trim: TrimModel, created: bool}
     */
    public function publish(?string $id, array $payload, array $files): array
    {
        $this->beginPublish();

        $existing = $id === null
            ? null
            : ($this->catalog->findTrim($id) ?? throw new ModelNotFoundException("Nalichnik topilmadi: {$id}"));

        $trimId = $existing?->id ?? $this->repo->mintId(TrimModel::class);

        $trimSourcePath = $this->stage($files['trimSource'] ?? null, 'trims', $trimId, 'trim')
            ?? $existing?->trim_source_path;
        $sourcePath = $this->stage($files['source'] ?? null, 'trims', $trimId, 'source')
            ?? $existing?->source_path;

        return $this->commitAndSettle(function () use ($trimId, $existing, $payload, $trimSourcePath, $sourcePath) {
            $t = $payload['trim'];
            $label = $t['category'] === 'korona' ? 'Korona' : 'Nalichnik';

            $trim = $this->repo->upsertTrim($trimId, [
                'name_uz' => trim($t['name']['uz']) ?: $label,
                'name_kk' => trim($t['name']['kk']) ?: $label,
                'name_ru' => trim($t['name']['ru']) ?: $label,
                // The operator may move a design to the other category. The
                // unique index is on (owner_leaf_id, category), and a standalone
                // design has a null owner — which MySQL does not treat as equal
                // to itself — so any number of them can share a category.
                'category' => $t['category'],
                'trim_margin' => $t['trimMargin'],
                'trim_boxes' => $t['trimBoxes'],
                'trim_source_path' => $trimSourcePath,
                'source_path' => $sourcePath,
                'corners' => $t['corners'] ?? null,
                'origin' => $existing?->origin ?? Origin::Bench->value,
                'overridden' => $existing?->origin === Origin::Builtin->value,
                'hidden' => false,
                'position' => $existing?->position ?? $this->repo->nextPosition('trim_models'),
            ]);

            $this->supersede($existing?->trim_source_path, $trimSourcePath);
            $this->supersede($existing?->source_path, $sourcePath);

            return ['trim' => $trim, 'created' => $existing === null];
        });
    }
}
