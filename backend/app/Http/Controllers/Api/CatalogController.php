<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ColorResource;
use App\Http\Resources\LeafResource;
use App\Http\Resources\RoomResource;
use App\Http\Resources\TrimResource;
use App\Repositories\CatalogRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The catalogue the showroom reads. No authentication: this is the product
 * range, and the machine showing it is a monitor in a shop.
 */
class CatalogController extends Controller
{
    public function __construct(private readonly CatalogRepository $catalog) {}

    /**
     * The whole catalogue in one document.
     *
     * One endpoint rather than four. The showroom needs all four lists before it
     * can render anything, so four requests would be four chances to fail and
     * four round trips; and — the part that actually matters — one response is
     * one atomic snapshot, so a bench publish that writes a door and its two
     * trim designs can never be observed half-applied.
     *
     * ETag'd because the common case is a client that already has this exact
     * document: showroom screens poll for changes, and 304 costs nothing.
     */
    public function index(Request $request): JsonResponse
    {
        $version = $this->catalog->version();
        $etag = '"'.$version.'"';

        if (trim($request->header('If-None-Match', ''), 'W/') === $etag) {
            return response()->json(null, 304)->setEtag($version);
        }

        return response()->json([
            'version' => $version,
            'leaves' => LeafResource::collection($this->catalog->leaves())->resolve(),
            'rooms' => RoomResource::collection($this->catalog->rooms())->resolve(),
            'trims' => TrimResource::collection($this->catalog->trims())->resolve(),
            'colors' => ColorResource::collection($this->catalog->colors())->resolve(),
        ])->setEtag($version)->header('Cache-Control', 'no-cache, private');
    }

    /**
     * The version alone — about thirty bytes.
     *
     * This is the poll target. A showroom monitor and the bench are usually
     * different machines, so the CustomEvent the frontend dispatches in-page
     * cannot reach across; asking "has anything changed" cheaply and fetching
     * the document only when the answer moves is what replaces it.
     */
    public function version(): JsonResponse
    {
        return response()->json(['version' => $this->catalog->version()])
            ->header('Cache-Control', 'no-cache, private');
    }
}
