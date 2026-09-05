<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PublishTrimRequest;
use App\Http\Resources\Admin\AdminTrimResource;
use App\Repositories\CatalogRepository;
use App\Services\TrimPublisher;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;

class TrimController extends Controller
{
    public function __construct(
        private readonly TrimPublisher $publisher,
        private readonly CatalogRepository $catalog,
    ) {}

    public function store(PublishTrimRequest $request): JsonResponse
    {
        return $this->publish($request, null);
    }

    public function update(PublishTrimRequest $request, string $id): JsonResponse
    {
        return $this->publish($request, $id);
    }

    private function publish(PublishTrimRequest $request, ?string $id): JsonResponse
    {
        try {
            $result = $this->publisher->publish($id, $request->validated('payload'), [
                'trimSource' => $request->file('trimSource'),
                'source' => $request->file('source'),
            ]);
        } catch (UniqueConstraintViolationException) {
            /**
             * One case reaches here: moving a design a DOOR traced into the
             * category that door's other design already occupies. The unique
             * index on (owner_leaf_id, category) refuses it, and rightly — a
             * door cannot have two koronas.
             *
             * Refused rather than resolved silently. The alternatives are both
             * worse: dropping the door link would detach a design from the door
             * that traced it (and silence its orphan warning), and overwriting
             * the other design would destroy work the operator did not ask to
             * lose.
             */
            return response()->json([
                'message' => 'Bu eshikda allaqachon shu turdagi dizayn bor. Avval uni o‘chiring.',
                'code' => 'CATEGORY_TAKEN',
            ], 409);
        }

        return response()->json([
            'version' => $this->catalog->version(),
            'trim' => new AdminTrimResource($result['trim']),
        ], $result['created'] ? 201 : 200);
    }
}
