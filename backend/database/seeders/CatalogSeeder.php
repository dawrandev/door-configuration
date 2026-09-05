<?php

namespace Database\Seeders;

use App\Models\DoorColor;
use App\Models\Leaf;
use App\Models\Room;
use App\Models\TrimModel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Seed the catalogue the offline pipelines produced.
 *
 *   php artisan db:seed --class=CatalogSeeder      seed what is missing
 *   php artisan catalog:reset-to-factory            overwrite back to shipped
 *
 * The destructive path is a separate COMMAND, not a flag on this one. It was
 * briefly `--force`, which is Laravel's own flag for "run without confirming in
 * production" — so a deploy script's routine `db:seed --force` would have
 * quietly reset every door the workshop had re-cut back to its shipped
 * photograph. Destroying work should never share a name with something safe.
 *
 * Idempotent: re-running changes nothing, so it is safe in a deploy script. It
 * writes a row only if that id is absent, which is what makes it double as
 * "restore original" for a single built-in that was re-cut at the bench.
 *
 * The built-in IMAGES are copied out of ../kiosk/public/assets and into
 * storage/, rather than being served from the SPA bundle where they already
 * sit. That costs a copy but buys one runtime code path: every item's image is a
 * /storage/catalog/... URL whatever its origin, so nothing downstream branches
 * on built-in-versus-bench, and re-cutting a built-in overwrites in the same
 * place as any other door.
 */
class CatalogSeeder extends Seeder
{
    /** Where the offline pipelines write. Read-only from here. */
    private string $assets;

    /** Set by catalog:reset-to-factory. Never true during an ordinary seed. */
    public bool $factoryReset = false;

    public function run(): void
    {
        $this->assets = base_path('../kiosk/public');

        if (! File::isDirectory($this->assets)) {
            $this->command?->error("kiosk/public not found at {$this->assets}");

            return;
        }

        DB::transaction(function () {
            $this->seedColors();
            $this->seedLeaves();
            $this->seedRooms();
            $this->seedTrims();
        });

        $this->command?->info(sprintf(
            'catalogue: %d colours, %d doors, %d rooms, %d trim designs',
            DoorColor::count(), Leaf::count(), Room::count(), TrimModel::count()
        ));
    }

    /** One seed file, decoded. */
    private function data(string $name): array
    {
        $file = database_path("seeders/data/{$name}.json");

        return File::exists($file) ? json_decode(File::get($file), true, 512, JSON_THROW_ON_ERROR) : [];
    }

    /**
     * Copy one pipeline asset into storage under a content-hashed name, and
     * return the path to record.
     *
     * The hash is not decoration. recolor.ts keys its render cache on the source
     * string, so a filename that stayed the same across a re-cut would serve the
     * door its predecessor's recolour for the life of the page. It is also what
     * makes `Cache-Control: immutable` safe on /storage/catalog.
     *
     * @param  string  $src  a path as the frontend writes it, e.g. /assets/leaves/lattice.webp
     */
    private function copyAsset(?string $src, string $kind, string $id, string $slot): ?string
    {
        if ($src === null || $src === '') {
            return null;
        }

        $from = $this->assets.$src;
        if (! File::exists($from)) {
            $this->command?->warn("missing asset: {$src}");

            return null;
        }

        $ext = pathinfo($from, PATHINFO_EXTENSION);
        $hash = substr(sha1_file($from), 0, 8);
        $rel = "catalog/{$kind}/{$id}/{$slot}-{$hash}.{$ext}";
        $to = storage_path("app/public/{$rel}");

        File::ensureDirectoryExists(dirname($to));
        // Skip the copy when the bytes are already there — the name carries the
        // hash, so a matching name is a matching file.
        if (! File::exists($to)) {
            File::copy($from, $to);
        }

        return $rel;
    }

    private function seedColors(): void
    {
        foreach ($this->data('colors') as $i => $c) {
            $this->upsert(DoorColor::class, $c['id'], [
                'name_uz' => $c['name']['uz'],
                'name_kk' => $c['name']['kk'],
                'name_ru' => $c['name']['ru'],
                'hex' => $c['hex'],
                'origin' => 'builtin',
                'position' => ($i + 1) * 100,
            ]);
        }
    }

    private function seedLeaves(): void
    {
        foreach ($this->data('leaves') as $i => $l) {
            $id = $l['id'];
            $this->upsert(Leaf::class, $id, [
                'name_uz' => $l['name']['uz'],
                'name_kk' => $l['name']['kk'],
                'name_ru' => $l['name']['ru'],
                'image_path' => $this->copyAsset($l['image'] ?? null, 'leaves', $id, 'image'),
                'source_path' => $this->copyAsset($l['source'] ?? null, 'leaves', $id, 'source'),
                'aspect' => $l['aspect'],
                'handle_side' => $l['handleSide'],
                'handle_swappable' => $l['handleSwappable'] ?? false,
                'handle_at' => $l['handleAt'] ?? null,
                'corners' => $l['corners'] ?? null,
                'keep_regions' => $l['keep'] ?? null,
                'white' => $l['white'] ?? true,
                'handle_choice' => $l['handleChoice'] ?? 'none',
                // An absent colorIds means "every colour, including ones added
                // later" — not "every colour that exists right now".
                'color_mode' => isset($l['colorIds']) ? 'list' : 'all',
                'trim_role_mode' => isset($l['trimRoles']) ? 'list' : 'all',
                'trim_roles' => $l['trimRoles'] ?? null,
                'origin' => 'builtin',
                'position' => ($i + 1) * 100,
            ]);

            if (isset($l['colorIds'])) {
                Leaf::find($id)?->colors()->sync($l['colorIds']);
            }
        }
    }

    private function seedRooms(): void
    {
        foreach ($this->data('rooms') as $i => $r) {
            $id = $r['id'];
            $this->upsert(Room::class, $id, [
                'name_uz' => $r['name']['uz'],
                'name_kk' => $r['name']['kk'],
                'name_ru' => $r['name']['ru'],
                'image_path' => $this->copyAsset($r['image'] ?? null, 'rooms', $id, 'image'),
                'thumb_path' => $this->copyAsset($r['thumb'] ?? null, 'rooms', $id, 'thumb'),
                'source_path' => $this->copyAsset($r['source'] ?? null, 'rooms', $id, 'source'),
                'aspect' => $r['aspect'],
                'open' => $r['open'],
                'trim_boxes' => $r['trimBoxes'] ?? null,
                'light' => $r['light'],
                'box' => $r['box'] ?? null,
                'origin' => 'builtin',
                'position' => ($i + 1) * 100,
            ]);
        }
    }

    /** Empty today — no trim design has ever shipped with the bundle — but the
     *  path exists so a future built-in needs no new code. */
    private function seedTrims(): void
    {
        foreach ($this->data('trims') as $i => $t) {
            $id = $t['id'];
            $this->upsert(TrimModel::class, $id, [
                'name_uz' => $t['name']['uz'],
                'name_kk' => $t['name']['kk'],
                'name_ru' => $t['name']['ru'],
                'category' => $t['category'],
                'trim_margin' => $t['trimMargin'],
                'trim_boxes' => $t['trimBoxes'],
                'trim_source_path' => $this->copyAsset($t['trimSource'] ?? null, 'trims', $id, 'trim'),
                'source_path' => $this->copyAsset($t['source'] ?? null, 'trims', $id, 'source'),
                'corners' => $t['corners'] ?? null,
                'origin' => 'builtin',
                'position' => ($i + 1) * 100,
            ]);
        }
    }

    /**
     * Write the row if it is absent; leave it alone if it is there.
     *
     * That "leave it alone" is deliberate and is the whole reason this is safe
     * to run on every deploy: a built-in re-cut at the bench keeps its new
     * pixels. `catalog:reset-to-factory` overwrites, which is the deliberate
     * way back.
     *
     * @param  class-string<Model>  $model
     */
    private function upsert(string $model, string $id, array $attributes): void
    {
        $existing = $model::find($id);

        if ($existing === null) {
            $model::create(['id' => $id] + $attributes);

            return;
        }

        if (! $this->factoryReset) {
            return;
        }

        // Clearing these is part of "back to shipped", but door_colors has
        // neither: colours are add-only, so there is nothing to override or
        // hide. Filtered against the columns the row actually has rather than
        // listed per model, so a new flag on one table does not need this
        // method edited to match.
        $flags = array_intersect_key(
            ['overridden' => false, 'hidden' => false],
            $existing->getAttributes()
        );

        $existing->fill($attributes + $flags)->save();
    }
}
