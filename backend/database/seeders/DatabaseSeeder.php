<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * Both of these are idempotent, so a deploy can run `db:seed` freely: the
     * catalogue seeder writes only ids that are absent, and the bench user is
     * created once and never re-applied — re-applying it would reset the
     * workshop's password from .env behind their back.
     *
     * This used to be Laravel's stub, which meant a routine `migrate --seed`
     * seeded no catalogue at all and left a stray test@example.com account
     * that could sign in to the bench.
     */
    public function run(): void
    {
        $this->call([
            AdminUserSeeder::class,
            CatalogSeeder::class,
        ]);
    }
}
