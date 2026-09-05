<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /**
         * Do not try to redirect an unauthenticated API request to a sign-in
         * page.
         *
         * Laravel's ApplicationBuilder installs `redirectGuestsTo(fn () =>
         * route('login'))` unconditionally, and Authenticate::unauthenticated()
         * calls it for any request that did not send `Accept: application/json`
         * — which a plain `fetch()` does not. This application has no `login`
         * route (the bench's sign-in is a screen inside the SPA), so that call
         * throws RouteNotFoundException and the bench gets a **500 where it
         * needs a 401** to know it should show its login form.
         *
         * Returning null here leaves AuthenticationException with no redirect,
         * and the JSON renderer below turns it into a clean 401. The crash
         * happens inside the middleware, before the exception handler runs, so
         * `shouldRenderJsonWhen` alone is not enough to prevent it.
         */
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('api/*') ? null : '/'
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        /**
         * The API lives in routes/web.php (Architecture.md §3), so Laravel does
         * not assume JSON the way it would under routes/api.php. Without this,
         * an unauthenticated request that did not happen to send
         * `Accept: application/json` takes the browser path: Handler's
         * `unauthenticated()` calls `redirect()->guest(route('login'))`, there
         * is no route named `login`, and the bench gets a **500 where it
         * expects a 401** — with no way to tell it to show its sign-in screen.
         *
         * A plain `fetch()` sends `Accept: * / *`, so this is the normal case,
         * not an edge one.
         */
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*'));

        /**
         * PostTooLargeException carries an EMPTY message, so the stock JSON
         * body is `{"message":""}` and the bench has nothing to show. It is
         * also the one error the workshop will actually meet: a room is
         * published at the photograph's full camera resolution, and a shared
         * host's default post_max_size is 8M.
         *
         * The limit is reported so the cause is diagnosable from the bench
         * rather than presenting as a mysterious failure on one server only.
         */
        $exceptions->render(function (HttpException $e, Request $request) {
            if ($e->getStatusCode() !== 413 || ! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => "So'rov juda katta — rasm hajmini kichraytiring.",
                'limit' => ini_get('post_max_size'),
            ], 413);
        });
    })->create();
