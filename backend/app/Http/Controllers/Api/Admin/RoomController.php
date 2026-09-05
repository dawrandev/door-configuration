<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PublishRoomRequest;
use App\Http\Resources\Admin\AdminRoomResource;
use App\Repositories\CatalogRepository;
use App\Services\RoomPublisher;
use Illuminate\Http\JsonResponse;

class RoomController extends Controller
{
    public function __construct(
        private readonly RoomPublisher $publisher,
        private readonly CatalogRepository $catalog,
    ) {}

    public function store(PublishRoomRequest $request): JsonResponse
    {
        return $this->publish($request, null);
    }

    public function update(PublishRoomRequest $request, string $id): JsonResponse
    {
        return $this->publish($request, $id);
    }

    private function publish(PublishRoomRequest $request, ?string $id): JsonResponse
    {
        $result = $this->publisher->publish($id, $request->validated('payload'), [
            'image' => $request->file('image'),
            'source' => $request->file('source'),
        ]);

        return response()->json([
            'version' => $this->catalog->version(),
            'room' => new AdminRoomResource($result['room']),
        ], $result['created'] ? 201 : 200);
    }
}
