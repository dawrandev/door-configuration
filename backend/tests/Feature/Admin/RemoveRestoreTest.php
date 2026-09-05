<?php

namespace Tests\Feature\Admin;

use App\Models\DoorColor;
use App\Models\Leaf;
use App\Models\TrimModel;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\MakesCatalogUploads;
use Tests\TestCase;

/**
 * Deleting a catalogue item — one rule, three outcomes.
 *
 * The bench states it as "drop the bench entry if there is one, else hide"
 * (adminStore.ts:102-113). What decides which arm runs used to be an `a-`
 * prefix on the id; it is now the origin and overridden columns, and these
 * tests are what say the behaviour did not change with the mechanism.
 */
class RemoveRestoreTest extends TestCase
{
    use MakesCatalogUploads, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /** Seed the shipped catalogue, so the built-in arms have something real. */
    private function seedBuiltIns(): void
    {
        $this->seed(CatalogSeeder::class);
    }

    private function publishBenchDoor(array $trims = []): Leaf
    {
        $this->actingAs($this->bench())->post('/api/admin/leaves', array_filter([
            'payload' => json_encode(array_filter([
                'leaf' => $this->leafPayload(),
                'trims' => $trims ?: null,
            ])),
            'image' => $this->jpeg([1, 2, 3]),
            'trimSource' => $trims ? $this->webp() : null,
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        return Leaf::where('origin', 'bench')->firstOrFail();
    }

    // ---- case 1: a bench item is really deleted ----

    public function test_deleting_a_bench_door_removes_the_row_and_its_files(): void
    {
        $leaf = $this->publishBenchDoor();
        $image = $leaf->image_path;
        Storage::disk('public')->assertExists($image);

        $this->actingAs($this->bench())
            ->deleteJson("/api/admin/leaves/{$leaf->id}")
            ->assertOk()
            ->assertJsonPath('action', 'deleted');

        $this->assertNull(Leaf::find($leaf->id));
        Storage::disk('public')->assertMissing($image);
    }

    /**
     * Designs the door traced OUTLIVE it.
     *
     * The foreign key is nullOnDelete, so they stay in the catalogue with their
     * own files and simply stop naming an owner — the same reasoning the door
     * bench gives for not deleting a design a publish did not mention: a
     * customer may already be choosing it.
     */
    public function test_designs_survive_the_door_that_traced_them(): void
    {
        $leaf = $this->publishBenchDoor([
            $this->trimPayload('nalichnik', [$this->piece('shaft')]),
            $this->trimPayload('korona', [$this->piece('crown')]),
        ]);
        $trimPaths = TrimModel::pluck('trim_source_path')->all();

        $response = $this->actingAs($this->bench())->deleteJson("/api/admin/leaves/{$leaf->id}")->assertOk();

        $this->assertCount(2, $response->json('orphanedTrims'), 'the bench is told what outlived the door');
        $this->assertSame(2, TrimModel::count());
        $this->assertSame([null, null], TrimModel::pluck('owner_leaf_id')->all());
        foreach ($trimPaths as $path) {
            Storage::disk('public')->assertExists($path);
        }
    }

    // ---- case 2: a re-cut built-in goes back to shipped ----

    public function test_deleting_a_re_cut_builtin_restores_the_shipped_version(): void
    {
        $this->seedBuiltIns();
        $original = Leaf::where('origin', 'builtin')->orderBy('position')->firstOrFail();

        // Re-cut it: new pixels, new name.
        $this->actingAs($this->bench())->post("/api/admin/leaves/{$original->id}", [
            'payload' => json_encode(['leaf' => $this->leafPayload(['name' => ['uz' => 'Qayta kesilgan', 'kk' => 'x', 'ru' => 'x']])]),
            'image' => $this->jpeg([9, 9, 9]),
        ], ['Accept' => 'application/json'])->assertStatus(200);

        $recut = $original->fresh();
        $this->assertTrue((bool) $recut->overridden);
        $this->assertSame('Qayta kesilgan', $recut->name_uz);
        $this->assertNotSame($original->image_path, $recut->image_path);

        $this->actingAs($this->bench())
            ->deleteJson("/api/admin/leaves/{$original->id}")
            ->assertOk()
            ->assertJsonPath('action', 'restored');

        $back = $original->fresh();
        $this->assertFalse((bool) $back->overridden);
        $this->assertFalse((bool) $back->hidden);
        $this->assertSame($original->name_uz, $back->name_uz);
        $this->assertSame($original->image_path, $back->image_path, 'the shipped photograph should be back');
    }

    // ---- case 3: an untouched built-in is hidden, never deleted ----

    public function test_deleting_an_untouched_builtin_hides_it_and_keeps_its_files(): void
    {
        $this->seedBuiltIns();
        $leaf = Leaf::where('origin', 'builtin')->orderBy('position')->firstOrFail();

        $this->actingAs($this->bench())
            ->deleteJson("/api/admin/leaves/{$leaf->id}")
            ->assertOk()
            ->assertJsonPath('action', 'hidden');

        $this->assertTrue((bool) $leaf->fresh()->hidden);
        // Its pixels ship in the seed; there is nothing to delete.
        Storage::disk('public')->assertExists($leaf->image_path);
        // And the showroom stops offering it.
        $ids = collect($this->getJson('/api/catalog')->json('leaves'))->pluck('id');
        $this->assertNotContains($leaf->id, $ids);
    }

    public function test_a_hidden_item_can_be_brought_back(): void
    {
        $this->seedBuiltIns();
        $leaf = Leaf::where('origin', 'builtin')->orderBy('position')->firstOrFail();
        $this->actingAs($this->bench())->deleteJson("/api/admin/leaves/{$leaf->id}")->assertOk();

        $this->actingAs($this->bench())
            ->postJson("/api/admin/leaves/{$leaf->id}/unhide")
            ->assertOk()
            ->assertJsonPath('action', 'unhidden');

        $ids = collect($this->getJson('/api/catalog')->json('leaves'))->pluck('id');
        $this->assertContains($leaf->id, $ids);
    }

    /** A caller unhiding something already visible is working from a stale list
     *  and should refetch, not be told nothing happened. */
    public function test_unhiding_a_visible_item_is_a_conflict(): void
    {
        $leaf = $this->publishBenchDoor();

        $this->actingAs($this->bench())
            ->postJson("/api/admin/leaves/{$leaf->id}/unhide")
            ->assertStatus(409)
            ->assertJsonPath('code', 'NOT_HIDDEN');
    }

    /**
     * The asymmetry the bench has: after restoring, the card reads "tayyor"
     * again, so pressing the same button once more HIDES it.
     */
    public function test_pressing_delete_twice_on_a_re_cut_builtin_restores_then_hides(): void
    {
        $this->seedBuiltIns();
        $leaf = Leaf::where('origin', 'builtin')->orderBy('position')->firstOrFail();

        $this->actingAs($this->bench())->post("/api/admin/leaves/{$leaf->id}", [
            'payload' => json_encode(['leaf' => $this->leafPayload()]),
            'image' => $this->jpeg([9, 9, 9]),
        ], ['Accept' => 'application/json'])->assertStatus(200);

        $this->actingAs($this->bench())->deleteJson("/api/admin/leaves/{$leaf->id}")
            ->assertJsonPath('action', 'restored');
        $this->actingAs($this->bench())->deleteJson("/api/admin/leaves/{$leaf->id}")
            ->assertJsonPath('action', 'hidden');
    }

    // ---- rename ----

    public function test_renaming_writes_all_three_languages(): void
    {
        $leaf = $this->publishBenchDoor();

        $this->actingAs($this->bench())->patchJson("/api/admin/leaves/{$leaf->id}", [
            'name' => ['uz' => 'Yangi', 'kk' => 'Jańa', 'ru' => 'Новая'],
        ])->assertOk()->assertJsonPath('item.name.ru', 'Новая');

        $now = $leaf->fresh();
        $this->assertSame(['Yangi', 'Jańa', 'Новая'], [$now->name_uz, $now->name_kk, $now->name_ru]);
    }

    /** The old Edit type allowed `handleSide`, but no bench control ever wrote
     *  it, and a door's handle side is not a list-screen decision. */
    public function test_renaming_ignores_a_handle_side_it_is_sent(): void
    {
        $leaf = $this->publishBenchDoor();

        $this->actingAs($this->bench())->patchJson("/api/admin/leaves/{$leaf->id}", [
            'name' => ['uz' => 'Yangi', 'kk' => 'Yangi', 'ru' => 'Yangi'],
            'handleSide' => 'right',
        ])->assertOk();

        $this->assertSame($leaf->handle_side, $leaf->fresh()->handle_side);
    }

    public function test_an_unknown_id_is_a_404(): void
    {
        $this->actingAs($this->bench())->deleteJson('/api/admin/leaves/nosuch')->assertStatus(404);
        $this->actingAs($this->bench())->patchJson('/api/admin/rooms/nosuch', [
            'name' => ['uz' => 'x', 'kk' => 'x', 'ru' => 'x'],
        ])->assertStatus(404);
    }

    /**
     * The row is created directly rather than through the API, because
     * `actingAs` persists for the rest of the test — publishing first would
     * leave this "guest" signed in and the assertion would pass for the wrong
     * reason.
     */
    public function test_a_guest_cannot_delete_or_rename(): void
    {
        $leaf = Leaf::create([
            'id' => 'a-guarded',
            'name_uz' => 'x', 'name_kk' => 'x', 'name_ru' => 'x',
            'image_path' => 'catalog/leaves/a-guarded/image-1.webp',
            'aspect' => 0.4, 'handle_side' => 'left', 'handle_swappable' => false,
            'color_mode' => 'all', 'trim_role_mode' => 'all', 'origin' => 'bench', 'position' => 100,
        ]);

        $this->deleteJson("/api/admin/leaves/{$leaf->id}")->assertStatus(401);
        $this->patchJson("/api/admin/leaves/{$leaf->id}", ['name' => ['uz' => 'x', 'kk' => 'x', 'ru' => 'x']])
            ->assertStatus(401);
        $this->postJson("/api/admin/leaves/{$leaf->id}/unhide")->assertStatus(401);

        $this->assertNotNull(Leaf::find($leaf->id));
    }

    // ---- colours ----

    public function test_it_registers_a_paint(): void
    {
        $this->actingAs($this->bench())->postJson('/api/admin/colors', [
            'name' => ['uz' => 'Zangori', 'kk' => 'Zańgar', 'ru' => 'Лазурь'],
            'hex' => '#3a5f9f',
        ])->assertStatus(201)->assertJsonPath('color.hex', '#3A5F9F');

        $this->assertSame(1, DoorColor::count());
        $this->assertSame('bench', DoorColor::first()->origin);
    }

    public function test_a_malformed_hex_is_rejected(): void
    {
        $this->actingAs($this->bench())->postJson('/api/admin/colors', [
            'name' => ['uz' => 'x', 'kk' => 'x', 'ru' => 'x'],
            'hex' => 'blue',
        ])->assertStatus(422)->assertJsonValidationErrors('hex');
    }

    /**
     * Colours are add-only: the store has never had a delete or a hide, and the
     * shared rename/delete/unhide routes are constrained to the three kinds
     * that do. So there is no route to reach — a 404, not a refusal.
     */
    public function test_colours_have_no_delete_route(): void
    {
        $this->actingAs($this->bench())->deleteJson('/api/admin/colors/oq')->assertStatus(404);
        $this->actingAs($this->bench())->patchJson('/api/admin/colors/oq', [
            'name' => ['uz' => 'x', 'kk' => 'x', 'ru' => 'x'],
        ])->assertStatus(404);
    }
}
