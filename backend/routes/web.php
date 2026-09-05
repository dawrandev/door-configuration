<?php

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
    Route::get('catalog', [CatalogController::class, 'index']);
    Route::get('catalog/version', [CatalogController::class, 'version']);
});
