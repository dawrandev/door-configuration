<?php

namespace Tests\Feature;

use App\Models\Leaf;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Image URLs must be RELATIVE.
 *
 * This is not a style preference. recolor.ts, rectify.ts and roomProcess.ts read
 * canvases back with getImageData in seven places, and not one of them sets
 * `crossOrigin`. A cross-origin image taints the canvas and every one of those
 * reads throws SecurityError — so an absolute URL here is a showroom that
 * renders nothing, with no server-side symptom at all.
 *
 * In production the SPA and this app share an origin, so an absolute URL would
 * work there and fail only in development, where the SPA is on :5173 and this
 * app on :8000. That is the worst shape a bug can have: invisible where it is
 * introduced, and broken where it is being worked on.
 *
 * Deliberately NOT using Storage::fake(). `Storage::buildDiskConfiguration()`
 * drops the `url` key when faking, so a faked disk returns a relative URL
 * whatever config/filesystems.php actually says — the test would pass while the
 * real configuration was wrong, which is worse than having no test.
 */
class ImageUrlTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalogue_image_urls_are_relative_and_have_no_host(): void
    {
        Leaf::create([
            'id' => 'lattice',
            'name_uz' => 'Romb', 'name_kk' => 'Romb', 'name_ru' => 'Ромб',
            'image_path' => 'catalog/leaves/lattice/image-9f3ab21c.webp',
            'aspect' => 0.3939,
            'handle_side' => 'left',
            'handle_swappable' => false,
            'color_mode' => 'all',
            'trim_role_mode' => 'all',
            'origin' => 'builtin',
            'position' => 100,
        ]);

        $image = $this->getJson('/api/catalog')->assertOk()->json('leaves.0.image');

        $this->assertSame('/storage/catalog/leaves/lattice/image-9f3ab21c.webp', $image);
        $this->assertStringNotContainsString('://', $image, 'an absolute URL taints the canvas in dev');
    }

    /**
     * The `public` disk is the one holding catalogue images, and it is the one
     * whose url must be relative. Asserted on the configuration directly
     * because it is a one-line edit in a file nothing else fails on.
     */
    public function test_the_public_disk_is_configured_for_relative_urls(): void
    {
        $this->assertSame('/storage', config('filesystems.disks.public.url'));
    }

    /**
     * `serve` on the private disk registers GET /storage/{path} against
     * storage/app/private, which has no visibility set — so ServeFile demands a
     * signature and answers 403. It is masked by the public/storage symlink
     * today and would surface the moment PHP handles a /storage request.
     */
    public function test_the_private_disk_does_not_claim_the_storage_route(): void
    {
        $this->assertFalse(config('filesystems.disks.local.serve'));
        $this->assertTrue(config('filesystems.disks.public.serve'));
    }
}
