<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * The one bench account.
 *
 * Created from the environment on the FIRST run and never again: env supplies
 * the initial password, and from then on the database is the authority. That
 * matters because .env is edited casually — during a deploy, while chasing an
 * unrelated setting — and a seeder that re-applied it would silently reset the
 * workshop's password every time someone ran a routine `db:seed`.
 *
 * To change it afterwards: `php artisan bench:password`.
 */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = config('bench.email');

        if (User::where('email', $email)->exists()) {
            $this->command?->info("bench user {$email} already exists — password left alone");

            return;
        }

        User::create([
            'name' => config('bench.name'),
            'email' => $email,
            'password' => Hash::make(config('bench.password')),
        ]);

        $this->command?->info("bench user created: {$email}");
        $this->command?->warn('Change the password before this is used for real: php artisan bench:password');
    }
}
