<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web routes
|--------------------------------------------------------------------------
|
| The API lives here, under an /api prefix, and NOT in a routes/api.php.
|
| This application serves the kiosk SPA itself, so the session cookie is
| same-origin. That removes CORS, removes token storage, and removes an
| XSS-readable bearer token — and it means the `web` group's CSRF protection
| applies to every write for free. Laravel sets XSRF-TOKEN on the first page
| load; the SPA reads it and echoes it back in X-XSRF-TOKEN.
|
| See Architecture.md §3.
|
*/

Route::prefix('api')->group(function () {
    // The product range. No authentication — this is what the showroom shows.
    Route::get('catalog', [CatalogController::class, 'index']);
    Route::get('catalog/version', [CatalogController::class, 'version']);

    // Throttled per email+IP, not per IP: one showroom is one IP, and an
    // IP-only limit would let one mistyped password lock out the whole floor.
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);
});
