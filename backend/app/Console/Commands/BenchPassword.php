<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

/**
 * Change the bench password.
 *
 * The only supported way to do it after the first seed. Editing ADMIN_PASSWORD
 * in .env does nothing on purpose — see AdminUserSeeder for why.
 */
class BenchPassword extends Command
{
    protected $signature = 'bench:password {--email= : which account, if there is more than one}';

    protected $description = 'Set the bench user password';

    public function handle(): int
    {
        $email = $this->option('email') ?? config('bench.email');
        $user = User::where('email', $email)->first();

        if ($user === null) {
            $this->error("No user with email {$email}. Run: php artisan db:seed --class=AdminUserSeeder");

            return self::FAILURE;
        }

        // secret() so it is not echoed, and not left in the shell history the way
        // an argument would be.
        $password = $this->secret('New password');
        if ($password === null || strlen($password) < 8) {
            $this->error('At least 8 characters.');

            return self::FAILURE;
        }
        if ($password !== $this->secret('Repeat it')) {
            $this->error('They do not match.');

            return self::FAILURE;
        }

        $user->forceFill(['password' => Hash::make($password)])->save();
        $this->info("Password changed for {$email}.");

        return self::SUCCESS;
    }
}
