<?php

/**
 * The workshop bench account.
 *
 * Read through config rather than env() directly so `php artisan config:cache`
 * on a server does not leave these permanently null — env() returns nothing once
 * the config is cached, which is the classic way a seeded password silently
 * becomes empty.
 */
return [
    'name' => env('ADMIN_NAME', 'Ustaxona'),
    'email' => env('ADMIN_EMAIL', 'bench@dawran.local'),
    'password' => env('ADMIN_PASSWORD', 'almashtiring'),
];
