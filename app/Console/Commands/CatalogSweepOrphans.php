<?php

namespace App\Console\Commands;

use App\Repositories\CatalogWriteRepository;
use App\Services\CatalogAssets;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Delete catalogue files that no row points at.
 *
 * Publishing writes its files before committing its rows, because content-hashed
 * names make that non-destructive and it avoids the far worse failure of
 * committed rows pointing at files that were never renamed into place. The
 * publisher already cleans up after a failure it can catch; this collects what
 * a hard crash — a killed process, a fatal error — leaves behind.
 *
 * Orphans are invisible and harmless. They cost disk, nothing else. So this
 * REPORTS by default and only deletes with --force, the same shape
 * catalog:reset-to-factory uses: destroying things should never be the easy
 * spelling.
 */
class CatalogSweepOrphans extends Command
{
    protected $signature = 'catalog:sweep-orphans {--force : actually delete them}';

    protected $description = 'Find (and with --force, delete) catalogue files no row references';

    public function handle(CatalogWriteRepository $repo, CatalogAssets $assets): int
    {
        $referenced = $repo->referencedPaths();
        $orphans = array_values(array_diff($assets->all(), $referenced));

        if ($orphans === []) {
            $this->info('catalog:sweep-orphans — nothing unreferenced.');

            return self::SUCCESS;
        }

        $disk = Storage::disk('public');
        $bytes = 0;
        foreach ($orphans as $path) {
            $bytes += $disk->exists($path) ? $disk->size($path) : 0;
            $this->line('  '.$path);
        }

        $summary = sprintf('%d unreferenced file(s), %s', count($orphans), $this->humanise($bytes));

        if (! $this->option('force')) {
            $this->warn($summary.'. Nothing deleted — re-run with --force.');

            return self::SUCCESS;
        }

        foreach ($orphans as $path) {
            $assets->forget($path);
        }

        $this->info('Deleted '.$summary.'.');

        return self::SUCCESS;
    }

    private function humanise(int $bytes): string
    {
        return $bytes >= 1048576
            ? round($bytes / 1048576, 1).'MB'
            : round($bytes / 1024).'KB';
    }
}
