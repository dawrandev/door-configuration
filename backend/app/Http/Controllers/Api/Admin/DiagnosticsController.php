<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Repositories\CatalogRepository;
use App\Repositories\CatalogWriteRepository;
use App\Services\CatalogAssets;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

/**
 * What the bench's "Tashxis" button copies to the clipboard.
 *
 * It replaces a report the frontend built from localStorage (Admin.tsx:267-316),
 * which derived an image's type and size from its data-URL prefix
 * (`src.slice(5, src.indexOf(';'))`) — meaningless once an image is an HTTP URL,
 * and blind to the thing that now actually matters: whether the file is there.
 *
 * Geometry is what goes wrong with a trim, so geometry is what this reports —
 * rounded to three decimals, exactly as before, because it is pasted into a
 * message. Photographs are deliberately not included.
 */
class DiagnosticsController extends Controller
{
    public function __construct(
        private readonly CatalogRepository $catalog,
        private readonly CatalogWriteRepository $repo,
        private readonly CatalogAssets $assets,
    ) {}

    public function index(): JsonResponse
    {
        $referenced = $this->repo->referencedPaths();
        $onDisk = $this->assets->all();

        return response()->json([
            'version' => $this->catalog->version(),

            /**
             * The upload ceiling this server actually has.
             *
             * A room is published at the photograph's full camera resolution,
             * and a shared host's default post_max_size is 8M. Without this a
             * failure on one server and not another is a mystery; with it, it
             * is one line of the report.
             */
            'limits' => [
                'postMaxSize' => ini_get('post_max_size'),
                'uploadMaxFilesize' => ini_get('upload_max_filesize'),
                'maxFileUploads' => ini_get('max_file_uploads'),
            ],

            'storage' => [
                'files' => count($onDisk),
                'referenced' => count($referenced),
                // Files no row points at. Harmless, invisible, and swept by
                // `catalog:sweep-orphans`.
                'orphans' => count(array_diff($onDisk, $referenced)),
                // Rows pointing at a file that is gone. This one IS visible —
                // it is a broken image on the showroom floor.
                'missing' => count(array_filter($referenced, fn ($p) => ! in_array($p, $onDisk, true))),
            ],

            'trims' => $this->catalog->trims(includeHidden: true)->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name_uz,
                'category' => $t->category,
                'ownerLeafId' => $t->owner_leaf_id,
                'origin' => $t->origin,
                'hidden' => (bool) $t->hidden,
                'margin' => $t->trim_margin,
                'boxes' => collect($t->trim_boxes)->map(fn ($b) => [
                    'role' => $b['role'] ?? null,
                    'label' => $b['label'] ?? null,
                    'x' => $this->r3($b['x']), 'y' => $this->r3($b['y']),
                    'w' => $this->r3($b['w']), 'h' => $this->r3($b['h']),
                    'points' => collect($b['points'] ?? [])->map(fn ($p) => [$this->r3($p['x']), $this->r3($p['y'])]),
                    // A count, not the points — the question is whether it has
                    // a hole, not where.
                    'hole' => count($b['holePoints'] ?? []),
                ]),
                'file' => $this->describe($t->trim_source_path),
            ]),

            'rooms' => $this->catalog->rooms(includeHidden: true)->map(fn ($r) => [
                'id' => $r->id,
                'open' => $r->open,
                'trimBoxes' => collect($r->trim_boxes ?? [])->map(fn ($b) => [
                    'role' => $b['role'] ?? null,
                    'x' => $this->r3($b['x']), 'y' => $this->r3($b['y']),
                    'w' => $this->r3($b['w']), 'h' => $this->r3($b['h']),
                ]),
                'files' => [
                    'image' => $this->describe($r->image_path),
                    'thumb' => $this->describe($r->thumb_path),
                ],
            ]),

            'leaves' => $this->catalog->leaves(includeHidden: true)->map(fn ($l) => [
                'id' => $l->id,
                'name' => $l->name_uz,
                'origin' => $l->origin,
                'overridden' => (bool) $l->overridden,
                'hidden' => (bool) $l->hidden,
                // The sentinel the old report used, kept so the two read alike.
                'trimRoles' => $l->trim_role_mode === 'list' ? $l->trim_roles : 'all',
                'colors' => $l->color_mode === 'list' ? $l->colors->pluck('id') : 'all',
                'file' => $this->describe($l->image_path),
            ]),
        ]);
    }

    private function r3(mixed $v): float
    {
        return round((float) $v, 3);
    }

    /** Real facts about a file, replacing a guess made from a data-URL prefix. */
    private function describe(?string $path): ?array
    {
        if ($path === null || $path === '') {
            return null;
        }

        $disk = Storage::disk('public');

        if (! $disk->exists($path)) {
            return ['path' => $path, 'missing' => true];
        }

        return [
            'path' => $path,
            'mime' => $disk->mimeType($path),
            'bytes' => $disk->size($path),
            'missing' => false,
        ];
    }
}
