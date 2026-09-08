<?php

use App\Http\Controllers\Api\Admin\AdminCatalogController;
use App\Http\Controllers\Api\Admin\CatalogItemController;
use App\Http\Controllers\Api\Admin\ColorController;
use App\Http\Controllers\Api\Admin\DiagnosticsController;
use App\Http\Controllers\Api\Admin\LeafController;
use App\Http\Controllers\Api\Admin\RoomController;
use App\Http\Controllers\Api\Admin\TrimController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

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
    $id = '[A-Za-z0-9._-]{1,64}';

    Route::middleware(['auth', 'can:bench'])->prefix('admin')->group(function () use ($id) {
        // POST for the replace, not PUT: PHP does not populate $_FILES for PUT,
        // and _method spoofing would make every upload depend on a hidden field
        // that silently turns a re-cut into a create if it goes missing.
        // The catalogue the bench sees: hidden items included, plus every
        // field needed to reopen an item and re-cut it.
        Route::get('catalog', [AdminCatalogController::class, 'index']);
        Route::get('diagnostics', [DiagnosticsController::class, 'index']);

        Route::post('leaves', [LeafController::class, 'store']);
        Route::post('leaves/{id}', [LeafController::class, 'update'])->where('id', $id);

        Route::post('rooms', [RoomController::class, 'store']);
        Route::post('rooms/{id}', [RoomController::class, 'update'])->where('id', $id);

        Route::post('trims', [TrimController::class, 'store']);
        Route::post('trims/{id}', [TrimController::class, 'update'])->where('id', $id);

        // Add-only: no update, no delete. Once a shade is mixed and named there
        // is no reason to take it from a door already wearing it.
        Route::post('colors', [ColorController::class, 'store']);

        /*
         * Rename, delete and unhide are identical across the three kinds, so
         * they share a controller and take the kind as a segment. Publishing
         * genuinely differs per kind and does not.
         *
         * Registered AFTER the publish routes so `POST admin/leaves/{id}` is
         * matched by LeafController@update rather than being swallowed here.
         */
        $kinds = 'leaves|rooms|trims';
        Route::patch('{kind}/{id}', [CatalogItemController::class, 'rename'])->where(['kind' => $kinds, 'id' => $id]);
        Route::delete('{kind}/{id}', [CatalogItemController::class, 'destroy'])->where(['kind' => $kinds, 'id' => $id]);
        Route::post('{kind}/{id}/unhide', [CatalogItemController::class, 'unhide'])->where(['kind' => $kinds, 'id' => $id]);
    });
});

/*
|--------------------------------------------------------------------------
| Catalogue pictures
|--------------------------------------------------------------------------
|
| Every catalogue file is named after a hash of its own bytes, so a given URL
| can never mean two different pictures — which is exactly the condition that
| makes `immutable` safe (Architecture.md §5). Without it a showroom re-fetched
| a 200KB door on every colour the customer tried: Laravel's own `serve` route
| answers with `no-store`, being written for files that can change under a
| fixed name.
|
| Registered BEFORE the disk's serve route, which the framework appends, so
| this one matches first. In production the public/storage symlink normally
| answers ahead of PHP entirely and the web server's own caching applies; this
| covers the shared-hosting case where that symlink cannot exist.
|
*/
Route::get('storage/catalog/{path}', function (string $path) {
    // The pattern below has to allow dots (every filename has one) and slashes
    // (the files are nested by id), which together also spell `..` — so the
    // one thing it cannot express is excluded here. Without this the route
    // reads anything else on the public disk, which a test caught doing.
    abort_if(str_contains($path, '..'), 404);

    $disk = Storage::disk('public');
    $file = 'catalog/'.$path;

    abort_unless($disk->exists($file), 404);

    return $disk->response($file, null, [
        'Cache-Control' => 'public, max-age=31536000, immutable',
    ]);
})->where('path', '[A-Za-z0-9._/-]+')->name('catalog.file');

/*
|--------------------------------------------------------------------------
| The SPA
|--------------------------------------------------------------------------
|
| This app serves the showroom itself, from its own public directory. That is
| a correctness requirement rather than a packaging choice: recolor.ts reads
| every door back out of a canvas with getImageData, and a canvas that has had
| a cross-origin image drawn into it is tainted, so /storage and the page that
| draws from it must share an origin (Architecture.md §4).
|
| The build is copied into public/ at deploy time and is not in the repository,
| so this says plainly when it is missing rather than answering a bare 404 that
| looks like a routing problem.
|
| Registered last, as a fallback, so every route above still wins. /api and
| /storage are excluded: an unmatched call there is a mistake and deserves its
| own 404, not a page of HTML that a fetch() would try to parse as JSON.
|
*/
/*
 * An unmatched API or storage call answers 404 for EVERY method.
 *
 * `Route::fallback()` below registers for GET|HEAD only, so without these a
 * stray DELETE to a route that does not exist matched the fallback's URI but
 * not its method and came back 405 — a different claim, and one the colour
 * routes' own test pins, since they are add-only by design.
 *
 * Registered after the real routes, which therefore still win.
 */
Route::any('api/{any}', fn () => abort(404))->where('any', '.*');
Route::any('storage/{any}', fn () => abort(404))->where('any', '.*');

Route::fallback(function () {
    $index = public_path('index.html');

    abort_unless(File::exists($index), 503, 'The showroom build is not installed. Run the deploy, which copies kiosk/dist into public/.');

    // index.html names the hashed asset files, so it is the one thing that
    // must never be held: a cached copy would keep pointing at the previous
    // build's assets, which the deploy has already replaced.
    return response(File::get($index), 200, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache, must-revalidate',
    ]);
});
