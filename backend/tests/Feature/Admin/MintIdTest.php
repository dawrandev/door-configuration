<?php

namespace Tests\Feature\Admin;

use App\Models\Leaf;
use App\Models\TrimModel;
use App\Repositories\CatalogWriteRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Minted ids must be unique even when nothing has been written yet.
 *
 * This is not hypothetical. Publishing a door mints an id for its nalichnik AND
 * one for its korona BEFORE either row is inserted — the id is needed to build
 * the storage path, and the path is needed before the transaction. So the
 * "is this id already in the database?" check cannot separate them: neither is
 * there yet.
 *
 * With a millisecond timestamp alone, two mints inside the same millisecond
 * returned the same string. The two designs then shared a primary key and a
 * storage directory — silently, and only sometimes. It surfaced as a test that
 * failed roughly one run in three.
 */
class MintIdTest extends TestCase
{
    use RefreshDatabase;

    public function test_ids_minted_back_to_back_are_distinct(): void
    {
        $repo = app(CatalogWriteRepository::class);

        // Tight loop: every one of these lands in the same millisecond or two,
        // and none of them is inserted, so only the id's own entropy separates
        // them.
        $ids = [];
        for ($i = 0; $i < 200; $i++) {
            $ids[] = $repo->mintId(TrimModel::class);
        }

        $this->assertCount(200, array_unique($ids), 'minted ids collided');
    }

    public function test_a_minted_id_keeps_the_bench_prefix(): void
    {
        $id = app(CatalogWriteRepository::class)->mintId(Leaf::class);

        // The prefix is a readability convention now, not a load-bearing one —
        // built-in versus bench is the `origin` column. But it is still how a
        // bench id is recognised at a glance in the database.
        $this->assertStringStartsWith('a-', $id);
        $this->assertLessThanOrEqual(64, strlen($id), 'the id column is VARCHAR(64)');
    }

    public function test_it_does_not_hand_out_an_id_that_is_already_taken(): void
    {
        $repo = app(CatalogWriteRepository::class);
        $taken = $repo->mintId(Leaf::class);

        Leaf::create([
            'id' => $taken,
            'name_uz' => 'x', 'name_kk' => 'x', 'name_ru' => 'x',
            'image_path' => 'catalog/leaves/x/image-1.webp',
            'aspect' => 0.4, 'handle_side' => 'left', 'handle_swappable' => false,
            'color_mode' => 'all', 'trim_role_mode' => 'all', 'origin' => 'bench', 'position' => 100,
        ]);

        $this->assertNotSame($taken, $repo->mintId(Leaf::class));
    }
}
