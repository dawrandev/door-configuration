<?php

namespace App\Console\Commands;

use Database\Seeders\CatalogSeeder;
use Illuminate\Console\Command;

/**
 * Put the built-in catalogue back to the photographs and geometry the offline
 * pipelines produced, discarding anything the bench changed about them.
 *
 * Its own command rather than a flag on the seeder, because the seeder runs on
 * every deploy and this must not: a flag one typo away from the routine call
 * would eventually be typed. It confirms before doing anything, and says exactly
 * what it is about to overwrite.
 *
 * Doors and rooms ADDED at the bench are untouched — the seeder only knows the
 * ids it ships, so there is nothing here that can reach them.
 */
class CatalogResetToFactory extends Command
{
    protected $signature = 'catalog:reset-to-factory {--yes : skip the confirmation}';

    protected $description = 'Overwrite the built-in doors, rooms and colours back to their shipped state';

    public function handle(CatalogSeeder $seeder): int
    {
        $this->warn('This overwrites every BUILT-IN door, room and colour with the shipped version.');
        $this->line('Renames, hidden flags and re-cut photographs on those items are discarded.');
        $this->line('Doors and rooms added at the bench are not affected.');

        if (! $this->option('yes') && ! $this->confirm('Continue?', false)) {
            $this->info('Nothing changed.');

            return self::SUCCESS;
        }

        $seeder->factoryReset = true;
        $seeder->setCommand($this);
        $seeder->run();

        return self::SUCCESS;
    }
}
