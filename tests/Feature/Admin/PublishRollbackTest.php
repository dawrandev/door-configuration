<?php

namespace Tests\Feature\Admin;

use App\Models\Leaf;
use App\Models\TrimModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\Concerns\MakesCatalogUploads;
use Tests\TestCase;

/**
 * A failed publish must leave NEITHER the database nor the storage tree changed.
 *
 * The database half is the transaction. The storage half is not free: files are
 * written to their final paths BEFORE the transaction commits, deliberately —
 * content-hashed names make that non-destructive, and the alternative
 * (write to tmp/, commit, rename) has a worse failure window, where committed
 * rows point into tmp/ and the image is visibly broken.
 *
 * So the publisher compensates: on any throw it deletes the files THIS call
 * newly wrote. Files that were already on disk are left alone — a matching
 * content hash means the bytes were already there, which means some other row
 * references them, and deleting one would break a live image.
 */
class PublishRollbackTest extends TestCase
{
    use MakesCatalogUploads, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /** path => md5, over everything under the catalogue tree. */
    private function snapshot(): array
    {
        $disk = Storage::disk('public');

        return collect($disk->allFiles('catalog'))
            ->mapWithKeys(fn ($p) => [$p => md5($disk->get($p))])
            ->all();
    }

    public function test_a_failure_mid_transaction_leaves_no_row_and_no_new_file(): void
    {
        // Publish one door first, so "unchanged" means something stronger than
        // "still empty".
        $this->actingAs($this->bench())->post('/api/admin/leaves', [
            'payload' => json_encode(['leaf' => $this->leafPayload()]),
            'image' => $this->jpeg([10, 20, 30]),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $before = $this->snapshot();
        $this->assertNotEmpty($before);

        // Fires after the leaf row is inserted and after every file is already
        // at its final path — the exact window this test exists for.
        TrimModel::saving(fn () => throw new RuntimeException('boom'));

        try {
            $this->actingAs($this->bench())
                ->withoutExceptionHandling()
                ->post('/api/admin/leaves', [
                    'payload' => json_encode([
                        'leaf' => $this->leafPayload(['name' => ['uz' => 'Ikkinchi', 'kk' => 'Ikkinchi', 'ru' => 'Второй']]),
                        'trims' => [$this->trimPayload('nalichnik', [$this->piece('shaft')])],
                    ]),
                    // Different pixels, so these are genuinely new paths.
                    'image' => $this->jpeg([200, 100, 50]),
                    'trimSource' => $this->webp([90, 90, 90]),
                ], ['Accept' => 'application/json']);

            $this->fail('the publish was expected to throw');
        } catch (RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        } finally {
            // Model event listeners are static and would poison every later
            // test in the process.
            TrimModel::flushEventListeners();
        }

        $this->assertSame(1, Leaf::count(), 'the second leaf should have rolled back');
        $this->assertSame(0, TrimModel::count());
        $this->assertSame($before, $this->snapshot(), 'the storage tree changed');
    }

    /**
     * The other half of the guarantee: a file that was ALREADY on disk must
     * survive a failed publish that happened to reference it.
     *
     * Republishing the same pixels resolves to the same content hash, so the
     * publisher must recognise it as "already there" and not delete it during
     * cleanup — otherwise a failed re-cut would strip the live image off the
     * door it failed to change.
     */
    public function test_a_failed_republish_does_not_delete_the_existing_image(): void
    {
        $image = fn () => $this->jpeg([10, 20, 30]);

        $this->actingAs($this->bench())->post('/api/admin/leaves', [
            'payload' => json_encode(['leaf' => $this->leafPayload()]),
            'image' => $image(),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $leaf = Leaf::first();
        $before = $this->snapshot();

        TrimModel::saving(fn () => throw new RuntimeException('boom'));

        try {
            $this->actingAs($this->bench())
                ->withoutExceptionHandling()
                ->post("/api/admin/leaves/{$leaf->id}", [
                    'payload' => json_encode([
                        'leaf' => $this->leafPayload(),
                        'trims' => [$this->trimPayload('nalichnik', [$this->piece('shaft')])],
                    ]),
                    'image' => $image(),   // identical bytes -> identical path
                    'trimSource' => $this->webp(),
                ], ['Accept' => 'application/json']);
            $this->fail('expected to throw');
        } catch (RuntimeException) {
            // expected
        } finally {
            TrimModel::flushEventListeners();
        }

        Storage::disk('public')->assertExists($leaf->image_path);
        $this->assertSame($before, $this->snapshot());
        $this->assertSame($leaf->image_path, Leaf::first()->image_path);
    }
}
