<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * This app serves the showroom itself.
 *
 * Not for tidiness: recolor.ts reads every door back out of a canvas with
 * getImageData, and a canvas that has had a cross-origin image drawn into it
 * is tainted, so the page and /storage have to share an origin. Splitting them
 * across two hosts is a showroom that renders nothing, with no server-side
 * symptom at all.
 */
class SpaFallbackTest extends TestCase
{
    private string $index;

    /**
     * An installed build lives at exactly the path these tests write to, so
     * they save it first and put it back afterwards. Without that, running the
     * suite on a machine that had deployed once silently deleted the showroom.
     */
    private ?string $installed = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->index = public_path('index.html');
        $this->installed = File::exists($this->index) ? File::get($this->index) : null;
    }

    protected function tearDown(): void
    {
        if ($this->installed !== null) {
            File::put($this->index, $this->installed);
        } elseif (File::exists($this->index)) {
            File::delete($this->index);
        }
        parent::tearDown();
    }

    /** The "no build" cases have to start from a directory that has none. */
    private function withoutBuild(): void
    {
        if (File::exists($this->index)) {
            File::delete($this->index);
        }
    }

    public function test_it_serves_the_build_when_one_is_installed(): void
    {
        File::put($this->index, '<!doctype html><title>showroom</title>');

        $res = $this->get('/');

        $res->assertOk();
        $res->assertSee('showroom', false);
        $this->assertStringContainsString('text/html', $res->headers->get('Content-Type'));
    }

    /**
     * index.html names the hashed asset files, so a cached copy would keep
     * pointing at the previous build's assets after a deploy replaced them.
     */
    public function test_the_page_itself_is_never_cached(): void
    {
        File::put($this->index, '<!doctype html>');

        $cache = $this->get('/')->headers->get('Cache-Control');

        $this->assertStringContainsString('no-cache', $cache);
    }

    public function test_a_missing_build_says_so_instead_of_404ing(): void
    {
        $this->withoutBuild();

        $this->get('/')->assertStatus(503);
    }

    /**
     * An unmatched API call is a mistake and has to answer like one. Handing
     * back a page of HTML would have fetch() try to parse it as JSON, and the
     * error the SPA reported would be about syntax rather than the route.
     */
    public function test_an_unknown_api_route_is_still_a_404(): void
    {
        File::put($this->index, '<!doctype html>');

        $res = $this->getJson('/api/no-such-thing');

        $res->assertNotFound();
        $this->assertStringNotContainsString('doctype', strtolower($res->getContent()));
    }

    public function test_an_unknown_storage_path_is_still_a_404(): void
    {
        File::put($this->index, '<!doctype html>');

        $this->get('/storage/nope.webp')->assertNotFound();
    }
}
