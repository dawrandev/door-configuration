<?php

namespace Tests\Feature\Admin;

use App\Models\Leaf;
use App\Models\TrimModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\MakesCatalogUploads;
use Tests\TestCase;

/** The bench's own view of the catalogue, and the diagnostics report. */
class AdminCatalogTest extends TestCase
{
    use MakesCatalogUploads, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function publishDoor(array $trims = []): Leaf
    {
        $this->actingAs($this->bench())->post('/api/admin/leaves', array_filter([
            'payload' => json_encode(array_filter([
                'leaf' => $this->leafPayload(),
                'trims' => $trims ?: null,
            ])),
            'image' => $this->jpeg([5, 6, 7]),
            'trimSource' => $trims ? $this->webp() : null,
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        return Leaf::firstOrFail();
    }

    public function test_a_guest_cannot_read_the_bench_catalogue(): void
    {
        $this->getJson('/api/admin/catalog')->assertStatus(401);
        $this->getJson('/api/admin/diagnostics')->assertStatus(401);
    }

    /**
     * The bench edits what the showroom cannot see, so hidden items have to be
     * in its list — otherwise a hidden door has no card and no way back.
     */
    public function test_hidden_items_appear_for_the_bench_and_not_for_the_showroom(): void
    {
        $leaf = $this->publishDoor();
        Leaf::where('id', $leaf->id)->update(['hidden' => true]);

        $this->assertCount(0, $this->getJson('/api/catalog')->json('leaves'));
        $this->assertCount(1, $this->actingAs($this->bench())->getJson('/api/admin/catalog')->json('leaves'));
    }

    public function test_it_carries_the_fields_needed_to_reopen_a_door(): void
    {
        $this->actingAs($this->bench())->post('/api/admin/leaves', [
            'payload' => json_encode(['leaf' => $this->leafPayload()]),
            'image' => $this->jpeg(),
            'source' => $this->jpeg([50, 60, 70], 300, 700),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $leaf = $this->actingAs($this->bench())->getJson('/api/admin/catalog')->json('leaves.0');

        // The compact original and the marked corners are what make a door
        // re-cuttable rather than delete-and-redo.
        $this->assertStringStartsWith('/storage/catalog/', $leaf['source']);
        $this->assertCount(4, $leaf['corners']);
        $this->assertSame('all', $leaf['colorMode']);
        $this->assertSame('bench', $leaf['origin']);
        $this->assertFalse($leaf['hidden']);
    }

    /**
     * Which designs a door owns, stated by the server.
     *
     * The bench used to rebuild `a-<leafId>-<category>` and look it up
     * (adminStore.ts:164-173). It needs the answer for two things: reopening a
     * door with its trace, and warning that a design it no longer draws is
     * still in the catalogue.
     */
    public function test_a_door_reports_the_designs_it_owns(): void
    {
        $this->publishDoor([
            $this->trimPayload('nalichnik', [$this->piece('shaft')]),
            $this->trimPayload('korona', [$this->piece('crown')]),
        ]);

        $leaf = $this->actingAs($this->bench())->getJson('/api/admin/catalog')->json('leaves.0');

        $this->assertCount(2, $leaf['trims']);
        $this->assertEqualsCanonicalizing(
            ['nalichnik', 'korona'],
            array_column($leaf['trims'], 'category')
        );
    }

    public function test_a_matching_etag_gets_a_304(): void
    {
        $this->publishDoor();
        $version = $this->actingAs($this->bench())->getJson('/api/admin/catalog')->json('version');

        $this->actingAs($this->bench())
            ->withHeader('If-None-Match', '"'.$version.'"')
            ->get('/api/admin/catalog')
            ->assertStatus(304);
    }

    // ---- diagnostics ----

    /**
     * Real facts about a file, where the old report guessed from a data-URL
     * prefix (`src.slice(5, src.indexOf(';'))`) — which on an HTTP URL returns
     * a slice of the URL and a size measured in characters.
     */
    public function test_diagnostics_reports_the_real_type_and_size_of_an_image(): void
    {
        $this->publishDoor();

        $file = $this->actingAs($this->bench())->getJson('/api/admin/diagnostics')->json('leaves.0.file');

        $this->assertFalse($file['missing']);
        $this->assertSame('image/jpeg', $file['mime']);
        $this->assertGreaterThan(0, $file['bytes']);
    }

    /** The failure that is visible on the showroom floor. */
    public function test_diagnostics_notices_a_file_that_has_gone_missing(): void
    {
        $leaf = $this->publishDoor();
        Storage::disk('public')->delete($leaf->image_path);

        $report = $this->actingAs($this->bench())->getJson('/api/admin/diagnostics')->json();

        $this->assertSame(1, $report['storage']['missing']);
        $this->assertTrue($report['leaves'][0]['file']['missing']);
    }

    /** The failure that is not visible, and is only ever wasted disk. */
    public function test_diagnostics_counts_an_unreferenced_file_as_an_orphan(): void
    {
        $this->publishDoor();
        Storage::disk('public')->put('catalog/leaves/ghost/image-deadbeef.webp', 'x');

        $report = $this->actingAs($this->bench())->getJson('/api/admin/diagnostics')->json();

        $this->assertSame(1, $report['storage']['orphans']);
        $this->assertSame(0, $report['storage']['missing']);
    }

    /** So a host with post_max_size = 8M is diagnosable from the bench rather
     *  than presenting as a failure on one server and not another. */
    public function test_diagnostics_reports_the_upload_limits(): void
    {
        $limits = $this->actingAs($this->bench())->getJson('/api/admin/diagnostics')->json('limits');

        $this->assertNotEmpty($limits['postMaxSize']);
        $this->assertNotEmpty($limits['uploadMaxFilesize']);
    }

    public function test_diagnostics_rounds_geometry_so_it_stays_readable(): void
    {
        $this->publishDoor([$this->trimPayload('nalichnik', [
            $this->piece('shaft', ['x' => 0.123456789]),
        ])]);

        $box = $this->actingAs($this->bench())->getJson('/api/admin/diagnostics')->json('trims.0.boxes.0');

        $this->assertSame(0.123, $box['x']);
    }

    // ---- the two commands ----

    public function test_catalog_check_passes_when_every_file_is_present(): void
    {
        $this->publishDoor();

        $this->artisan('catalog:check')->assertExitCode(0);
    }

    public function test_catalog_check_fails_when_a_file_is_gone(): void
    {
        $leaf = $this->publishDoor();
        Storage::disk('public')->delete($leaf->image_path);

        $this->artisan('catalog:check')->assertExitCode(1);
    }

    /** Reporting is the default; deleting needs saying so. */
    public function test_sweep_orphans_reports_without_deleting_by_default(): void
    {
        $this->publishDoor();
        Storage::disk('public')->put('catalog/leaves/ghost/image-deadbeef.webp', 'x');

        $this->artisan('catalog:sweep-orphans')->assertExitCode(0);

        Storage::disk('public')->assertExists('catalog/leaves/ghost/image-deadbeef.webp');
    }

    public function test_sweep_orphans_deletes_with_force_and_keeps_referenced_files(): void
    {
        $leaf = $this->publishDoor();
        Storage::disk('public')->put('catalog/leaves/ghost/image-deadbeef.webp', 'x');

        $this->artisan('catalog:sweep-orphans --force')->assertExitCode(0);

        Storage::disk('public')->assertMissing('catalog/leaves/ghost/image-deadbeef.webp');
        Storage::disk('public')->assertExists($leaf->image_path);
    }

    public function test_a_trim_orphaned_by_a_deleted_door_keeps_its_files(): void
    {
        $leaf = $this->publishDoor([$this->trimPayload('nalichnik', [$this->piece('shaft')])]);
        $trimPath = TrimModel::first()->trim_source_path;

        $this->actingAs($this->bench())->deleteJson("/api/admin/leaves/{$leaf->id}")->assertOk();

        // The design outlived the door, so its file is still referenced and the
        // sweeper must not take it.
        $this->artisan('catalog:sweep-orphans --force')->assertExitCode(0);
        Storage::disk('public')->assertExists($trimPath);
    }
}
