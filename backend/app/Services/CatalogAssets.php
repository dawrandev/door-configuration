<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

/**
 * The one place catalogue images are written, named and removed.
 *
 * Filenames carry a content hash — `image-9f3ab21c.webp`. That is not
 * decoration and it is not only for cache-busting:
 *
 *   1. recolor.ts keys its render cache on the source string, so a filename
 *      that stayed the same across a re-cut would serve a door its
 *      predecessor's recolour for the life of the page.
 *   2. It makes `Cache-Control: immutable` safe on /storage/catalog.
 *   3. It makes writing NON-DESTRUCTIVE, which is what lets a publish write its
 *      files BEFORE committing its rows. A new hash is a new name and cannot
 *      overwrite a file another row still points at; a matching name means the
 *      bytes are already identical, so the write is a no-op.
 *
 * Point 3 is the reason there is no tmp/ directory here. The alternative —
 * write to tmp, commit, rename — fails worse: a crash between the commit and
 * the rename leaves rows pointing into tmp/, which is a visibly broken image.
 * Writing first can only leave orphan files, which nobody sees and
 * `catalog:sweep-orphans` collects.
 */
class CatalogAssets
{
    /** Every path this class produces starts here, so the sweeper knows its territory. */
    public const ROOT = 'catalog';

    /** What the benches can actually produce. `trimSource` is webp (png on a
     *  browser that cannot encode webp) and MUST keep its alpha — a trim's
     *  margin is transparent wherever the photograph did not reach, and JPEG
     *  would composite that onto black. */
    public const MIMES = ['image/jpeg', 'image/webp', 'image/png'];

    /** Store an upload under a content-hashed name and return its relative path. */
    public function store(UploadedFile $file, string $kind, string $id, string $slot): string
    {
        return $this->put($file->getRealPath(), $this->extensionOf($file), $kind, $id, $slot);
    }

    /** Copy a file already on disk — the seeder's path for shipped assets. */
    public function copy(string $absolutePath, string $kind, string $id, string $slot): ?string
    {
        if (! File::exists($absolutePath)) {
            return null;
        }

        return $this->put($absolutePath, pathinfo($absolutePath, PATHINFO_EXTENSION), $kind, $id, $slot);
    }

    /**
     * Remove a file that nothing points at any more.
     *
     * Silent when it is already gone, and refuses anything outside the
     * catalogue tree — this is called with paths read back out of the database,
     * and a corrupted row should not be able to delete arbitrary files.
     */
    public function forget(?string $path): void
    {
        if ($path === null || $path === '' || ! str_starts_with($path, self::ROOT.'/')) {
            return;
        }

        Storage::disk('public')->delete($path);
    }

    /** Every file currently under the catalogue tree, as relative paths. */
    public function all(): array
    {
        return Storage::disk('public')->allFiles(self::ROOT);
    }

    private function put(string $absolutePath, string $extension, string $kind, string $id, string $slot): string
    {
        $hash = substr(sha1_file($absolutePath), 0, 8);
        $relative = sprintf('%s/%s/%s/%s-%s.%s', self::ROOT, $kind, $id, $slot, $hash, $extension);
        $target = Storage::disk('public')->path($relative);

        // The name carries the hash, so a file that is already there is already
        // the right bytes. Skipping the copy also means two doors that share a
        // source photograph share one file.
        if (! File::exists($target)) {
            File::ensureDirectoryExists(dirname($target));
            File::copy($absolutePath, $target);
        }

        return $relative;
    }

    /**
     * The extension to store under, derived from the CONTENT rather than from
     * the client's filename.
     *
     * `canvas.toBlob` gives the bench a blob with no name at all, so whatever
     * arrives in `originalName` is something the fetch wrapper made up. What
     * matters downstream is that a `.webp` really is webp, because the browser
     * decodes it by content and the alpha channel has to survive.
     */
    private function extensionOf(UploadedFile $file): string
    {
        return match ($file->getMimeType()) {
            'image/webp' => 'webp',
            'image/png' => 'png',
            default => 'jpg',
        };
    }
}
