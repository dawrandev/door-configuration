<?php

namespace Tests\Concerns;

use App\Models\DoorColor;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;

/**
 * Real image files, not `UploadedFile::fake()->image()`.
 *
 * `fake()->image('a.jpg', 100, 100)` called twice produces BYTE-IDENTICAL files
 * (measured). Every path in this system is content-hashed, so two identical
 * fixtures land on the same filename — and a test asserting "re-publishing
 * different pixels gives a new URL" would pass for the wrong reason, or fail
 * for one. Varying `$rgb` gives genuinely different bytes.
 */
trait MakesCatalogUploads
{
    /** @var list<string> temp files to remove when the test ends */
    private array $fixtures = [];

    protected function tearDown(): void
    {
        foreach ($this->fixtures as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    /** @param array{int,int,int} $rgb */
    protected function jpeg(array $rgb = [200, 200, 200], int $w = 80, int $h = 200): UploadedFile
    {
        return $this->image('jpg', 'image/jpeg', $rgb, $w, $h);
    }

    /** The trim source is WebP because its margin is genuinely transparent —
     *  a JPEG there composites the un-photographed area onto black. */
    protected function webp(array $rgb = [180, 180, 180], int $w = 80, int $h = 200): UploadedFile
    {
        return $this->image('webp', 'image/webp', $rgb, $w, $h);
    }

    private function image(string $ext, string $mime, array $rgb, int $w, int $h): UploadedFile
    {
        $im = imagecreatetruecolor($w, $h);
        imagefilledrectangle($im, 0, 0, $w, $h, imagecolorallocate($im, ...$rgb));
        $path = tempnam(sys_get_temp_dir(), 'dc').'.'.$ext;

        $ext === 'webp' ? imagewebp($im, $path, 85) : imagejpeg($im, $path, 82);
        imagedestroy($im);
        $this->fixtures[] = $path;

        // test: true skips is_uploaded_file(), which only passes for a real
        // multipart request.
        return new UploadedFile($path, "door.{$ext}", $mime, null, true);
    }

    /** The bench account. Idempotent — a test that publishes twice calls this twice. */
    protected function bench(): User
    {
        return User::firstOrCreate(
            ['email' => 'bench@dawran.local'],
            ['name' => 'Ustaxona', 'password' => Hash::make('correct-horse')],
        );
    }

    protected function color(string $id): DoorColor
    {
        return DoorColor::create([
            'id' => $id,
            'name_uz' => $id, 'name_kk' => $id, 'name_ru' => $id,
            'hex' => '#ffffff', 'origin' => 'builtin', 'position' => 100,
        ]);
    }

    /** The leaf half of a publish payload, with sane defaults. */
    protected function leafPayload(array $overrides = []): array
    {
        return array_replace([
            'name' => ['uz' => 'Romb', 'kk' => 'Romb', 'ru' => 'Ромб'],
            'aspect' => 0.3939,
            'handleSide' => 'left',
            'handleSwappable' => false,
            'white' => true,
            'handleChoice' => 'none',
            'colorMode' => 'all',
            'trimRoleMode' => 'all',
            'corners' => [
                ['x' => 0.19, 'y' => 0.11], ['x' => 0.82, 'y' => 0.11],
                ['x' => 0.79, 'y' => 0.97], ['x' => 0.20, 'y' => 0.97],
            ],
        ], $overrides);
    }

    /** One traced piece. `role` decides which design it belongs to. */
    protected function piece(string $role = 'shaft', array $overrides = []): array
    {
        return array_replace([
            'role' => $role,
            'x' => 0.10, 'y' => 0.15, 'w' => 0.08, 'h' => 0.70,
            'points' => [
                ['x' => 0.10, 'y' => 0.15], ['x' => 0.18, 'y' => 0.15],
                ['x' => 0.18, 'y' => 0.85], ['x' => 0.10, 'y' => 0.85],
            ],
        ], $overrides);
    }

    protected function trimPayload(string $category, array $pieces): array
    {
        return [
            'category' => $category,
            'name' => ['uz' => ucfirst($category), 'kk' => ucfirst($category), 'ru' => ucfirst($category)],
            'trimMargin' => ['left' => 0.18, 'right' => 0.18, 'top' => 0.21, 'bottom' => 0.04],
            'trimBoxes' => $pieces,
        ];
    }
}
