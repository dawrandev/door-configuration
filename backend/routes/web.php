<?php

use App\Http\Controllers\Api\Admin\LeafController;
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

    /*
     * The workshop bench.
     *
     * `can:bench` is trivially true today (one account, and it is the bench's),
     * but every route reads it from the first commit so a second role later
     * changes one Gate rather than a dozen route definitions.
     *
     * Ids are plain string segments, not route-model bindings: implicit binding
     * would put a database query in this file, and Architecture.md §1 keeps
     * Eloquent inside a repository. The pattern bounds what can reach the
     * service.
     */
    Route::middleware(['auth', 'can:bench'])->prefix('admin')->group(function () {
        // POST for the replace, not PUT: PHP does not populate $_FILES for PUT,
        // and _method spoofing would make every upload depend on a hidden field
        // that silently turns a re-cut into a create if it goes missing.
        Route::post('leaves', [LeafController::class, 'store']);
        Route::post('leaves/{id}', [LeafController::class, 'update'])->where('id', '[A-Za-z0-9._-]{1,64}');
    });
});
