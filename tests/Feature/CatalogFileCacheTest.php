<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Catalogue pictures are cached hard, because their names cannot lie.
 *
 * Every file under catalog/ is named after a hash of its own bytes, so one URL
 * can never mean two different pictures — the condition `immutable` needs.
 * Laravel's own disk-serve route answers with `no-store`, being written for
 * files that DO change under a fixed name, which made a showroom re-fetch a
 * 200KB door on every colour a customer tried.
 */
class CatalogFileCacheTest extends TestCase
{
    private function putFile(string $path, string $bytes = 'not really a picture'): void
    {
        Storage::disk('public')->put($path, $bytes);
    }

    protected function tearDown(): void
    {
        Storage::disk('public')->deleteDirectory('catalog/__test');
        parent::tearDown();
    }

    public function test_a_catalogue_file_is_served_immutable(): void
    {
        $this->putFile('catalog/__test/leaf/image-deadbeef.webp');

        $res = $this->get('/storage/catalog/__test/leaf/image-deadbeef.webp');

        $res->assertOk();
        $cache = $res->headers->get('Cache-Control');
        $this->assertStringContainsString('immutable', $cache);
        $this->assertStringContainsString('max-age=31536000', $cache);
        $this->assertStringNotContainsString('no-store', $cache);
    }

    public function test_a_missing_catalogue_file_is_a_404(): void
    {
        $this->get('/storage/catalog/__test/leaf/image-00000000.webp')->assertNotFound();
    }

    /**
     * The route pattern must not become a way to read the rest of the disk:
     * only what lives under catalog/ is reachable through it.
     */
    public function test_it_cannot_be_walked_out_of_the_catalogue(): void
    {
        $this->putFile('__test-private.txt', 'secret');

        $this->get('/storage/catalog/../__test-private.txt')->assertNotFound();

        Storage::disk('public')->delete('__test-private.txt');
    }
}
