<?php

namespace Tests\Feature\Admin;

use App\Models\Leaf;
use App\Models\Room;
use App\Models\TrimModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\MakesCatalogUploads;
use Tests\TestCase;

/** Publishing rooms and standalone trim designs. */
class PublishRoomTrimTest extends TestCase
{
    use MakesCatalogUploads, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function roomPayload(array $overrides = []): array
    {
        return ['room' => array_replace([
            'name' => ['uz' => 'Yashash xonasi', 'kk' => 'Jasaw', 'ru' => 'Гостиная'],
            'aspect' => 0.75047,
            'open' => ['x' => 0.28625, 'y' => 0.14869, 'w' => 0.45062, 'h' => 0.77251],
            'light' => [1.0187, 0.9957, 0.9853],
        ], $overrides)];
    }

    private function publishRoom(array $payload, array $files = []): TestResponse
    {
        return $this->actingAs($this->bench())->post('/api/admin/rooms', array_merge([
            'payload' => json_encode($payload),
            'image' => $this->jpeg([220, 215, 205], 400, 533),
        ], $files), ['Accept' => 'application/json']);
    }

    private function publishTrim(array $trim, array $files = []): TestResponse
    {
        return $this->actingAs($this->bench())->post('/api/admin/trims', array_merge([
            'payload' => json_encode(['trim' => $trim]),
            'trimSource' => $this->webp(),
        ], $files), ['Accept' => 'application/json']);
    }

    // ---- rooms ----

    public function test_a_guest_cannot_publish_a_room_or_a_trim(): void
    {
        $this->post('/api/admin/rooms', [])->assertStatus(401);
        $this->post('/api/admin/trims', [])->assertStatus(401);
    }

    public function test_it_publishes_a_room(): void
    {
        $this->publishRoom($this->roomPayload(), ['source' => $this->jpeg([100, 100, 100], 300, 400)])
            ->assertStatus(201)
            ->assertJsonPath('room.name.uz', 'Yashash xonasi');

        $room = Room::first();
        Storage::disk('public')->assertExists($room->image_path);
        $this->assertSame('bench', $room->origin);
    }

    /**
     * The thumbnail IS the source: RoomBench assigns the same string to both
     * (RoomBench.tsx:336, :350). Uploading it twice would store two identical
     * files.
     *
     * The distinction that matters is against `image`, which has an unlit
     * recess painted where the doorway is — recolorTrim crops the trim's
     * lighting from `thumb ?? image` for exactly that reason (recolor.ts:462).
     */
    public function test_the_thumbnail_is_the_source_and_never_the_recessed_image(): void
    {
        $this->publishRoom($this->roomPayload(), ['source' => $this->jpeg([100, 100, 100], 300, 400)])
            ->assertStatus(201);

        $room = Room::first();
        $this->assertSame($room->source_path, $room->thumb_path);
        $this->assertNotSame($room->image_path, $room->thumb_path);
    }

    public function test_a_room_with_no_measured_trim_stores_none(): void
    {
        $this->publishRoom($this->roomPayload())->assertStatus(201);

        $this->assertNull(Room::first()->trim_boxes);
        $this->assertArrayNotHasKey('trimBoxes', $this->getJson('/api/catalog')->json('rooms.0'));
    }

    public function test_a_room_records_every_measured_trim_piece(): void
    {
        $this->publishRoom($this->roomPayload([
            'trimBoxes' => [$this->piece('shaft'), $this->piece('crown', ['y' => 0.05, 'h' => 0.04])],
        ]))->assertStatus(201);

        $this->assertCount(2, Room::first()->trim_boxes);
    }

    /** A doorway with no width cannot have a recess painted into it. */
    public function test_a_doorway_with_no_width_is_rejected(): void
    {
        $this->publishRoom($this->roomPayload([
            'open' => ['x' => 0.3, 'y' => 0.1, 'w' => 0, 'h' => 0.8],
        ]))->assertStatus(422)->assertJsonValidationErrors('payload.room.open.w');
    }

    public function test_an_impossible_light_multiplier_is_rejected(): void
    {
        $this->publishRoom($this->roomPayload(['light' => [0, 1, 1]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload.room.light.0');
    }

    public function test_republishing_a_room_keeps_its_id_and_position(): void
    {
        $this->publishRoom($this->roomPayload())->assertStatus(201);
        $was = Room::first();

        $this->actingAs($this->bench())->post("/api/admin/rooms/{$was->id}", [
            'payload' => json_encode($this->roomPayload(['name' => ['uz' => 'Boshqa', 'kk' => 'Boshqa', 'ru' => 'Другая']])),
            'image' => $this->jpeg([10, 10, 10], 400, 533),
        ], ['Accept' => 'application/json'])->assertStatus(200);

        $now = Room::first();
        $this->assertSame(1, Room::count());
        $this->assertSame($was->id, $now->id);
        $this->assertSame($was->position, $now->position);
        $this->assertSame('Boshqa', $now->name_uz);
        // Different pixels mean a different hash, so the old file goes.
        $this->assertNotSame($was->image_path, $now->image_path);
        Storage::disk('public')->assertMissing($was->image_path);
        Storage::disk('public')->assertExists($now->image_path);
    }

    /** Identical pixels resolve to the same content hash, so nothing moves and
     *  nothing is deleted. */
    public function test_republishing_identical_pixels_changes_no_file(): void
    {
        $image = fn () => $this->jpeg([220, 215, 205], 400, 533);

        $this->publishRoom($this->roomPayload(), ['image' => $image()])->assertStatus(201);
        $was = Room::first();

        $this->actingAs($this->bench())->post("/api/admin/rooms/{$was->id}", [
            'payload' => json_encode($this->roomPayload()),
            'image' => $image(),
        ], ['Accept' => 'application/json'])->assertStatus(200);

        $this->assertSame($was->image_path, Room::first()->image_path);
        Storage::disk('public')->assertExists($was->image_path);
    }

    // ---- standalone trim designs ----

    private function trim(string $category = 'nalichnik', array $overrides = []): array
    {
        return array_replace([
            'category' => $category,
            'name' => ['uz' => 'Klassik', 'kk' => 'Klassik', 'ru' => 'Классик'],
            'trimMargin' => ['left' => 0.2, 'right' => 0.2, 'top' => 0.25, 'bottom' => 0.02],
            'trimBoxes' => [$this->piece('shaft')],
        ], $overrides);
    }

    public function test_it_publishes_a_standalone_trim_design(): void
    {
        $this->publishTrim($this->trim())->assertStatus(201);

        $trim = TrimModel::first();
        $this->assertNull($trim->owner_leaf_id, 'a trim bench design belongs to no door');
        $this->assertSame('nalichnik', $trim->category);
        Storage::disk('public')->assertExists($trim->trim_source_path);
    }

    /** Two standalone designs can share a category: the unique index is on
     *  (owner_leaf_id, category), and a null owner is not equal to itself. */
    public function test_two_standalone_designs_may_share_a_category(): void
    {
        $this->publishTrim($this->trim())->assertStatus(201);
        $this->publishTrim($this->trim('nalichnik', ['name' => ['uz' => 'Ikkinchi', 'kk' => 'Ikkinchi', 'ru' => 'Второй']]))
            ->assertStatus(201);

        $this->assertSame(2, TrimModel::count());
    }

    public function test_a_design_can_be_moved_to_the_other_category(): void
    {
        $this->publishTrim($this->trim('nalichnik'))->assertStatus(201);
        $id = TrimModel::first()->id;

        $this->actingAs($this->bench())->post("/api/admin/trims/{$id}", [
            'payload' => json_encode(['trim' => $this->trim('korona')]),
            'trimSource' => $this->webp(),
        ], ['Accept' => 'application/json'])->assertStatus(200);

        $this->assertSame('korona', TrimModel::first()->category);
        $this->assertSame(1, TrimModel::count());
    }

    /**
     * A door cannot end up with two koronas. Moving one of its designs into the
     * category the other already occupies is refused rather than resolved
     * silently — dropping the door link would detach a design from the door
     * that traced it, and overwriting would destroy work.
     */
    public function test_moving_a_door_design_onto_its_sibling_category_is_refused(): void
    {
        $this->actingAs($this->bench())->post('/api/admin/leaves', [
            'payload' => json_encode([
                'leaf' => $this->leafPayload(),
                'trims' => [
                    $this->trimPayload('nalichnik', [$this->piece('shaft')]),
                    $this->trimPayload('korona', [$this->piece('crown')]),
                ],
            ]),
            'image' => $this->jpeg(),
            'trimSource' => $this->webp(),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $nalichnik = TrimModel::where('category', 'nalichnik')->first();
        $this->assertNotNull($nalichnik->owner_leaf_id);

        $this->actingAs($this->bench())->post("/api/admin/trims/{$nalichnik->id}", [
            'payload' => json_encode(['trim' => $this->trim('korona')]),
            'trimSource' => $this->webp(),
        ], ['Accept' => 'application/json'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'CATEGORY_TAKEN');

        // Nothing moved.
        $this->assertSame('nalichnik', $nalichnik->fresh()->category);
        $this->assertSame(1, Leaf::count());
        $this->assertSame(2, TrimModel::count());
    }

    public function test_a_trim_with_no_pieces_is_rejected(): void
    {
        $this->publishTrim($this->trim('nalichnik', ['trimBoxes' => []]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload.trim.trimBoxes');
    }

    /** photoMargin caps every side at 1.5 (rectify.ts:223-225), so anything
     *  past that did not come from the bench. */
    public function test_a_margin_beyond_the_measured_cap_is_rejected(): void
    {
        $this->publishTrim($this->trim('nalichnik', [
            'trimMargin' => ['left' => 1.6, 'right' => 0.2, 'top' => 0.25, 'bottom' => 0.02],
        ]))->assertStatus(422)->assertJsonValidationErrors('payload.trim.trimMargin.left');
    }
}
