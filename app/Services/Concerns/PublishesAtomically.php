<?php

namespace App\Services\Concerns;

use App\Services\CatalogAssets;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The write-files-then-commit dance, in one place.
 *
 * All three publishers do exactly this, and getting it wrong loses a
 * photograph — which is reason enough to have one implementation rather than
 * three that merely look alike.
 *
 *     stage the files at their FINAL paths
 *     commit the rows
 *     delete the files the commit superseded
 *     on any throw: delete the files THIS call wrote, and rethrow
 *
 * Files go to their final paths before the transaction because names are
 * content hashes, so writing is non-destructive: a new hash is a new name and
 * cannot overwrite a file another row points at. The alternative — tmp, commit,
 * rename — has a worse window, where committed rows point into tmp/ and the
 * image is visibly broken. Here the worst case is a file nobody references.
 *
 * The compensating delete on failure is what makes the guarantee strong: a
 * failed publish changes neither the database nor the storage tree. Only files
 * this call NEWLY wrote are removed — a path that was already on disk was
 * already referenced by something else, and removing it would break a live
 * image belonging to a row this publish never touched.
 */
trait PublishesAtomically
{
    /** Paths this call created, and may therefore clean up. */
    private array $written = [];

    /** Paths the commit made unreachable, deleted only once it succeeded. */
    private array $superseded = [];

    abstract protected function assets(): CatalogAssets;

    /** Reset between calls — the service is resolved once per request but the
     *  container may reuse it. */
    private function beginPublish(): void
    {
        $this->written = [];
        $this->superseded = [];
    }

    /**
     * Put one uploaded file at its final path.
     *
     * A null file means the part was not sent, which PRESERVES whatever is
     * stored rather than clearing it — re-cutting a door sends a new `image`
     * but usually no new `source`.
     */
    private function stage(?UploadedFile $file, string $kind, string $id, string $slot): ?string
    {
        if ($file === null) {
            return null;
        }

        [$path, $isNew] = $this->assets()->store($file, $kind, $id, $slot);

        if ($isNew) {
            $this->written[] = $path;
        }

        return $path;
    }

    /** Mark a path for deletion, but only if the new one really differs.
     *  Content hashing means they match whenever the pixels did not change. */
    private function supersede(?string $old, ?string $new): void
    {
        if ($old !== null && $old !== '' && $old !== $new) {
            $this->superseded[] = $old;
        }
    }

    /**
     * Run the row writes in a transaction and settle the files afterwards.
     *
     * @template T
     *
     * @param  callable():T  $rows
     * @return T
     */
    private function commitAndSettle(callable $rows): mixed
    {
        try {
            $result = DB::transaction($rows);
        } catch (Throwable $e) {
            foreach ($this->written as $path) {
                $this->assets()->forget($path);
            }

            throw $e;
        }

        // Only now: until the commit landed, the old paths were still the live
        // ones.
        foreach ($this->superseded as $path) {
            $this->assets()->forget($path);
        }

        return $result;
    }
}
