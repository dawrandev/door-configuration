<?php

namespace App\Repositories;

use App\Models\DoorColor;
use App\Models\Leaf;
use App\Models\Room;
use App\Models\TrimModel;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Every read of the catalogue. The only place Eloquent touches these tables.
 */
class CatalogRepository
{
    /**
     * The four tables, in the order the showroom shows them.
     *
     * Ordered by `position` and not by id or insertion: order is user-visible.
     * The first door is the one a fresh session opens on, and a built-in re-cut
     * at the bench has to keep its place in the strip rather than jumping to the
     * end.
     */
    public function leaves(bool $includeHidden = false): Collection
    {
        return Leaf::query()
            ->with('colors:id')
            ->unless($includeHidden, fn ($q) => $q->where('hidden', false))
            ->orderBy('position')->orderBy('created_at')
            ->get();
    }

    public function rooms(bool $includeHidden = false): Collection
    {
        return Room::query()
            ->unless($includeHidden, fn ($q) => $q->where('hidden', false))
            ->orderBy('position')->orderBy('created_at')
            ->get();
    }

    public function trims(bool $includeHidden = false): Collection
    {
        return TrimModel::query()
            ->unless($includeHidden, fn ($q) => $q->where('hidden', false))
            ->orderBy('position')->orderBy('created_at')
            ->get();
    }

    public function colors(): Collection
    {
        return DoorColor::query()->orderBy('position')->orderBy('created_at')->get();
    }

    /** One item by id, hidden or not — the bench edits what the showroom cannot see. */
    public function findLeaf(string $id): ?Leaf
    {
        return Leaf::with('colors:id')->find($id);
    }

    public function findRoom(string $id): ?Room
    {
        return Room::find($id);
    }

    public function findTrim(string $id): ?TrimModel
    {
        return TrimModel::find($id);
    }

    /**
     * The designs a door traced from its own photograph, keyed by category.
     *
     * This replaces `findDoorTrim` (adminStore.ts:170-173), which rebuilt the id
     * as `a-<leafId>-<category>` and looked it up as a string. A foreign key
     * answers the same question without the convention — and without the
     * failure mode where a renamed door can no longer find what it traced.
     *
     * @return \Illuminate\Support\Collection<string, TrimModel>
     */
    public function trimsOwnedBy(string $leafId): Collection
    {
        return TrimModel::where('owner_leaf_id', $leafId)->get()->keyBy('category');
    }

    /**
     * A cheap token that changes whenever anything in the catalogue does.
     *
     * The newest updated_at across all four tables, plus the total row count.
     * The count is what catches a DELETE, which moves no timestamp — without it
     * a removed door would leave every client believing it still had a current
     * copy.
     *
     * This is polled by showroom screens on other machines (the bench is often a
     * different computer from the monitor), so it has to be far cheaper than the
     * document it guards: four indexed aggregates against tens of rows.
     */
    public function version(): string
    {
        $tables = ['leaves', 'rooms', 'trim_models', 'door_colors'];
        $stamp = 0;
        $count = 0;

        foreach ($tables as $table) {
            $row = DB::table($table)->selectRaw('COUNT(*) AS n, MAX(updated_at) AS t')->first();
            $count += (int) $row->n;
            $stamp = max($stamp, $row->t ? strtotime($row->t) : 0);
        }

        return "{$stamp}-{$count}";
    }
}
