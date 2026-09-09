<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Session auth for the bench. Same-origin, so a cookie is all this needs — no
 * token to store, and nothing for XSS to read out of localStorage.
 */
class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $request->authenticate();

        // A fresh session id on every login, so a session fixed before the login
        // cannot be reused after it.
        $request->session()->regenerate();

        return response()->json(null, 204);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(null, 204);
    }

    /**
     * Who is signed in, or 401.
     *
     * The bench calls this on mount to decide between its login form and itself.
     * That gate is a convenience, not the security boundary — every write is
     * behind `auth` independently, so a stranger who reaches #/admin gets the
     * chrome and nothing else.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
    }
}
