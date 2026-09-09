<?php

namespace App\Console\Commands;

use App\Repositories\CatalogWriteRepository;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Find rows pointing at a file that is not there.
 *
 * This is the failure that is actually VISIBLE — a door with no photograph on
 * the showroom floor — so it is the one worth being able to detect on demand.
 * The publish path is built so this should never find anything: files are
 * written before the rows that reference them, and a failed publish cleans up
 * after itself. If it does find something, either a deploy lost the storage
 * tree or something wrote a row by hand.
 *
 * Exits non-zero when it finds any, so it can be a deploy step.
 */
class CatalogCheck extends Command
{
    protected $signature = 'catalog:check';

    protected $description = 'Report catalogue rows whose image file is missing';

    public function handle(CatalogWriteRepository $repo): int
    {
        $disk = Storage::disk('public');
        $missing = array_values(array_filter(
            $repo->referencedPaths(),
            fn (string $path) => ! $disk->exists($path)
        ));

        if ($missing === []) {
            $this->info('catalog:check — every referenced file is present.');

            return self::SUCCESS;
        }

        $this->error(count($missing).' referenced file(s) missing:');
        foreach ($missing as $path) {
            $this->line('  '.$path);
        }

        return self::FAILURE;
    }
}
