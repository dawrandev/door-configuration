<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PublishLeafRequest;
use App\Http\Resources\Admin\AdminLeafResource;
use App\Http\Resources\Admin\AdminTrimResource;
use App\Repositories\CatalogRepository;
use App\Services\LeafPublisher;
use Illuminate\Http\JsonResponse;

/**
 * The door bench's write endpoints.
 *
 * Thin by design (Architecture.md §1): validate, hand to the service, shape the
 * answer. Every decision about what publishing MEANS lives in LeafPublisher.
 */
class LeafController extends Controller
{
    public function __construct(
        private readonly LeafPublisher $publisher,
        private readonly CatalogRepository $catalog,
    ) {}

    /** Publish a new door. */
    public function store(PublishLeafRequest $request): JsonResponse
    {
        return $this->publish($request, null);
    }

    /**
     * Re-cut an existing door.
     *
     * POST rather than PUT: PHP does not populate $_FILES for PUT, and
     * `_method` spoofing would make every upload depend on a hidden field that,
     * if dropped, silently becomes a create.
     */
    public function update(PublishLeafRequest $request, string $id): JsonResponse
    {
        return $this->publish($request, $id);
    }

    private function publish(PublishLeafRequest $request, ?string $id): JsonResponse
    {
        $result = $this->publisher->publish($id, $request->validated('payload'), [
            'image' => $request->file('image'),
            'source' => $request->file('source'),
            'trimSource' => $request->file('trimSource'),
        ]);

        return response()->json([
            // So the bench can tell whether the showroom needs to refetch.
            'version' => $this->catalog->version(),
            'leaf' => new AdminLeafResource($result['leaf']),
            'trims' => AdminTrimResource::collection($result['trims']),
        ], $result['created'] ? 201 : 200);
    }
}
