<?php

namespace App\Repositories;

use App\Models\DoorColor;
use App\Models\Leaf;
use App\Models\Room;
use App\Models\TrimModel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Every write to the catalogue. The only place outside CatalogRepository where
 * Eloquent touches these tables.
 *
 * One class rather than one per entity: publishing a door writes `leaves` and
 * `trim_models` in a single transaction, so splitting them would mean two
 * injections for the same code.
 */
class CatalogWriteRepository
{
    /** Which model each catalogue kind maps to. */
    public const MODELS = [
        'leaves' => Leaf::class,
        'rooms' => Room::class,
        'trims' => TrimModel::class,
    ];

    /**
     * A fresh id: `a-`, a base-36 millisecond timestamp, and four random
     * characters.
     *
     * The frontend's version is the timestamp alone (DoorBench.tsx:647), and
     * that is not enough here. Publishing a door mints ids for its nalichnik
     * AND its korona before either row is inserted — so a database check cannot
     * separate them, and two mints in the same millisecond return the SAME id.
     * The two designs then share a primary key and a storage directory. It is
     * rare, it is silent, and it corrupts data.
     *
     * The timestamp stays because it keeps ids roughly ordered and readable;
     * the random tail is what actually makes them unique. The DB check remains
     * as a backstop.
     *
     * Server-side rather than client-supplied: a browser cannot know what ids
     * exist, and a create carrying `id: "lattice"` would land on a shipped door.
     *
     * @param  class-string<Model>  $model
     */
    public function mintId(string $model): string
    {
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $id = 'a-'.base_convert((string) (int) (microtime(true) * 1000), 10, 36)
                .Str::lower(Str::random(4));

            if ($model::find($id) === null) {
                return $id;
            }
        }

        throw new RuntimeException('Could not mint a free id for '.$model);
    }

    /**
     * Where a new item goes in the catalogue's order.
     *
     * The seeder spaces built-ins 100 apart, so appending at max+100 leaves room
     * to reorder by hand later without renumbering. Two benches publishing at
     * once could tie; `orderBy('created_at')` in CatalogRepository breaks it,
     * which is cheaper than locking the table for a one-showroom shop.
     */
    public function nextPosition(string $table): int
    {
        return ((int) DB::table($table)->max('position')) + 100;
    }

    /** Create or replace a leaf, by id. */
    public function upsertLeaf(string $id, array $attributes): Leaf
    {
        $leaf = Leaf::firstOrNew(['id' => $id]);
        $leaf->fill($attributes);
        $leaf->id = $id;
        $leaf->save();

        return $leaf;
    }

    public function upsertRoom(string $id, array $attributes): Room
    {
        $room = Room::firstOrNew(['id' => $id]);
        $room->fill($attributes);
        $room->id = $id;
        $room->save();

        return $room;
    }

    /**
     * Create or replace the design a door owns for one category.
     *
     * Matched on `(owner_leaf_id, category)` — the UNIQUE index — and not on the
     * primary key. That is what makes republishing a door REPLACE its designs
     * instead of appending a second pair and orphaning the first, which is the
     * property `derivedTrimId`'s string surgery was reaching for
     * (adminStore.ts:151-165).
     */
    public function upsertTrimForLeaf(string $leafId, string $category, string $trimId, array $attributes): TrimModel
    {
        $trim = TrimModel::firstOrNew(['owner_leaf_id' => $leafId, 'category' => $category]);
        $trim->fill($attributes);
        $trim->id = $trim->exists ? $trim->id : $trimId;
        $trim->owner_leaf_id = $leafId;
        $trim->category = $category;
        $trim->save();

        return $trim;
    }

    /** A standalone design, from the trim bench — owned by no door. */
    public function upsertTrim(string $id, array $attributes): TrimModel
    {
        $trim = TrimModel::firstOrNew(['id' => $id]);
        $trim->fill($attributes);
        $trim->id = $id;
        $trim->save();

        return $trim;
    }

    public function createColor(string $id, array $attributes): DoorColor
    {
        return DoorColor::create(['id' => $id] + $attributes);
    }

    /**
     * Which paints this door is sold in.
     *
     * An empty list is correct for `color_mode = 'all'`: absence of a
     * restriction, not a restriction to nothing. A door on 'all' therefore picks
     * up colours registered later, which is what `colorIds === undefined` has
     * always meant on the client.
     */
    public function syncLeafColors(string $leafId, array $colorIds): void
    {
        Leaf::find($leafId)?->colors()->sync($colorIds);
    }

    /** Flip an item's visibility. Built-ins are hidden rather than deleted. */
    public function setHidden(Model $item, bool $hidden): void
    {
        $item->forceFill(['hidden' => $hidden])->save();
    }

    public function rename(Model $item, string $uz, string $kk, string $ru): void
    {
        $item->forceFill(['name_uz' => $uz, 'name_kk' => $kk, 'name_ru' => $ru])->save();
    }

    /**
     * Every image path any row currently points at.
     *
     * The sweeper's definition of "in use". A UNION over the seven path columns
     * rather than seven queries, because it is asked once per sweep over a
     * catalogue of tens of rows.
     *
     * @return string[]
     */
    public function referencedPaths(): array
    {
        $paths = DB::table('leaves')->select('image_path as p')
            ->unionAll(DB::table('leaves')->select('source_path as p'))
            ->unionAll(DB::table('rooms')->select('image_path as p'))
            ->unionAll(DB::table('rooms')->select('thumb_path as p'))
            ->unionAll(DB::table('rooms')->select('source_path as p'))
            ->unionAll(DB::table('trim_models')->select('trim_source_path as p'))
            ->unionAll(DB::table('trim_models')->select('source_path as p'))
            ->pluck('p');

        return $paths->filter()->unique()->values()->all();
    }

    /** Delete a row outright. Only ever called for `origin = bench` items. */
    public function delete(Model $item): void
    {
        $item->delete();
    }

    /** The directory a kind's files live under, for a wholesale removal. */
    public function directoryFor(string $kind, string $id): string
    {
        return 'catalog/'.Str::of($kind)->lower().'/'.$id;
    }
}
