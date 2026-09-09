<?php

namespace Tests\Feature;

use App\Models\DoorColor;
use App\Models\Leaf;
use App\Models\Room;
use App\Models\TrimModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The read API's contract with kiosk/src/catalog/types.ts.
 *
 * The showroom does not validate what it receives; it destructures it. So the
 * assertions that matter most here are about ABSENCE — an omitted `colorIds`
 * means "sold in every colour, including ones registered later", and sending
 * `null` or `[]` instead would quietly change what a door is sold in.
 */
class CatalogApiTest extends TestCase
{
    use RefreshDatabase;

    private function leaf(string $id, array $overrides = []): Leaf
    {
        return Leaf::create(array_merge([
            'id' => $id,
            'name_uz' => $id, 'name_kk' => $id, 'name_ru' => $id,
            'image_path' => "catalog/leaves/{$id}/image-abcd1234.webp",
            'aspect' => 0.4,
            'handle_side' => 'left',
            'handle_swappable' => false,
            'color_mode' => 'all',
            'trim_role_mode' => 'all',
            'origin' => 'builtin',
            'position' => 100,
        ], $overrides));
    }

    private function color(string $id, int $position = 100): DoorColor
    {
        return DoorColor::create([
            'id' => $id,
            'name_uz' => $id, 'name_kk' => $id, 'name_ru' => $id,
            'hex' => '#ffffff',
            'origin' => 'builtin',
            'position' => $position,
        ]);
    }

    public function test_it_returns_the_four_lists_and_a_version(): void
    {
        $this->leaf('lattice');
        $this->color('oq');

        $this->getJson('/api/catalog')
            ->assertOk()
            ->assertJsonStructure(['version', 'leaves', 'rooms', 'trims', 'colors'])
            ->assertJsonCount(1, 'leaves')
            ->assertJsonCount(1, 'colors');
    }

    public function test_a_door_sold_in_every_colour_omits_color_ids_entirely(): void
    {
        $this->leaf('lattice', ['color_mode' => 'all']);

        $leaf = $this->getJson('/api/catalog')->json('leaves.0');

        // Not null, not [] — absent. The frontend reads `!leaf.colorIds` as "no
        // restriction", and an empty array would mean the opposite.
        $this->assertArrayNotHasKey('colorIds', $leaf);
        $this->assertArrayNotHasKey('trimRoles', $leaf);
        $this->assertArrayNotHasKey('handleAt', $leaf);
        $this->assertArrayNotHasKey('keep', $leaf);
    }

    public function test_a_restricted_door_lists_exactly_its_colours(): void
    {
        $this->color('oq', 100);
        $this->color('kok', 200);
        $this->color('krem', 300);
        $leaf = $this->leaf('lattice', ['color_mode' => 'list']);
        $leaf->colors()->sync(['oq', 'kok']);

        $served = $this->getJson('/api/catalog')->json('leaves.0');

        $this->assertArrayHasKey('colorIds', $served);
        $this->assertEqualsCanonicalizing(['oq', 'kok'], $served['colorIds']);
    }

    public function test_hidden_items_are_not_served(): void
    {
        $this->leaf('shown');
        $this->leaf('gone', ['hidden' => true, 'position' => 200]);

        $ids = collect($this->getJson('/api/catalog')->json('leaves'))->pluck('id');

        $this->assertEquals(['shown'], $ids->all());
    }

    /**
     * Order is user-visible: the first door is what a fresh session opens on,
     * and a built-in re-cut at the bench has to keep its place in the strip.
     */
    public function test_items_come_back_in_position_order(): void
    {
        $this->leaf('third', ['position' => 300]);
        $this->leaf('first', ['position' => 100]);
        $this->leaf('second', ['position' => 200]);

        $ids = collect($this->getJson('/api/catalog')->json('leaves'))->pluck('id');

        $this->assertEquals(['first', 'second', 'third'], $ids->all());
    }

    public function test_image_paths_are_served_as_urls(): void
    {
        $this->leaf('lattice');

        $leaf = $this->getJson('/api/catalog')->json('leaves.0');

        $this->assertStringStartsWith('/storage/catalog/', $leaf['image']);
    }

    /**
     * A trim design's traced outline must survive the round trip in ORDER. The
     * renderer derives a polygon's winding direction from the point sequence, so
     * a reordered array turns a cutout inside out — silently, with no error.
     */
    public function test_traced_polygon_points_keep_their_order(): void
    {
        $points = [
            ['x' => 0.1, 'y' => 0.2],
            ['x' => 0.9, 'y' => 0.2],
            ['x' => 0.9, 'y' => 0.8],
            ['x' => 0.1, 'y' => 0.8],
        ];
        TrimModel::create([
            'id' => 'a-t1',
            'name_uz' => 't', 'name_kk' => 't', 'name_ru' => 't',
            'category' => 'nalichnik',
            'trim_margin' => ['left' => 0.1, 'right' => 0.1, 'top' => 0.1, 'bottom' => 0],
            'trim_boxes' => [['x' => 0.1, 'y' => 0.2, 'w' => 0.8, 'h' => 0.6, 'points' => $points, 'role' => 'shaft']],
            'trim_source_path' => 'catalog/trims/a-t1/trim-abcd1234.webp',
            'position' => 100,
        ]);

        $served = $this->getJson('/api/catalog')->json('trims.0');

        $this->assertSame($points, $served['trimBoxes'][0]['points']);
    }

    public function test_a_room_without_measured_trim_omits_trim_boxes(): void
    {
        Room::create([
            'id' => 'plain',
            'name_uz' => 'p', 'name_kk' => 'p', 'name_ru' => 'p',
            'image_path' => 'catalog/rooms/plain/image-abcd1234.jpg',
            'aspect' => 0.75,
            'open' => ['x' => 0.3, 'y' => 0.1, 'w' => 0.4, 'h' => 0.8],
            'light' => [1.0, 1.0, 1.0],
            'position' => 100,
        ]);

        $room = $this->getJson('/api/catalog')->json('rooms.0');

        $this->assertArrayNotHasKey('trimBoxes', $room);
        $this->assertArrayNotHasKey('thumb', $room);
    }

    public function test_the_version_endpoint_agrees_with_the_document(): void
    {
        $this->leaf('lattice');

        $document = $this->getJson('/api/catalog')->json('version');
        $cheap = $this->getJson('/api/catalog/version')->json('version');

        $this->assertSame($document, $cheap);
    }

    /** A delete moves no timestamp, so the count is what makes the version move. */
    public function test_the_version_changes_when_an_item_is_deleted(): void
    {
        $this->leaf('a');
        $this->leaf('b', ['position' => 200]);
        $before = $this->getJson('/api/catalog/version')->json('version');

        Leaf::find('b')->delete();

        $this->assertNotSame($before, $this->getJson('/api/catalog/version')->json('version'));
    }

    public function test_a_matching_etag_gets_a_304_with_no_body(): void
    {
        $this->leaf('lattice');
        $version = $this->getJson('/api/catalog/version')->json('version');

        $this->withHeader('If-None-Match', '"'.$version.'"')
            ->get('/api/catalog')
            ->assertStatus(304)
            ->assertNoContent(304);
    }
}
