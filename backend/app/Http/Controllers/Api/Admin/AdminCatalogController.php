<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\AdminLeafResource;
use App\Http\Resources\Admin\AdminRoomResource;
use App\Http\Resources\Admin\AdminTrimResource;
use App\Http\Resources\ColorResource;
use App\Repositories\CatalogRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The catalogue as the bench sees it: hidden items included, and every field
 * needed to reopen an item and re-cut it.
 *
 * A separate endpoint from /api/catalog rather than a query parameter on it.
 * The two have different audiences and different auth, and a public endpoint
 * that can be made to reveal hidden items on request is one forgotten check
 * away from revealing them by default.
 */
class AdminCatalogController extends Controller
{
    public function __construct(private readonly CatalogRepository $catalog) {}

    public function index(Request $request): JsonResponse
    {
        $version = $this->catalog->version();
        $etag = '"'.$version.'"';

        if (trim($request->header('If-None-Match', ''), 'W/') === $etag) {
            return response()->json(null, 304)->setEtag($version);
        }

        return response()->json([
            'version' => $version,
            'leaves' => AdminLeafResource::collection($this->catalog->leaves(includeHidden: true))->resolve(),
            'rooms' => AdminRoomResource::collection($this->catalog->rooms(includeHidden: true))->resolve(),
            'trims' => AdminTrimResource::collection($this->catalog->trims(includeHidden: true))->resolve(),
            'colors' => ColorResource::collection($this->catalog->colors())->resolve(),
        ])->setEtag($version)->header('Cache-Control', 'no-cache, private');
    }
}
