<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /**
         * Who may use the workshop bench.
         *
         * Trivially true today — there is one account and it is the bench's.
         * It exists anyway so every admin route can read
         * `->middleware(['auth', 'can:bench'])` from the first commit: when a
         * second role does arrive, this is the only line that changes, rather
         * than a dozen route definitions that each have to be found.
         */
        Gate::define('bench', fn (User $user) => true);
    }
}
