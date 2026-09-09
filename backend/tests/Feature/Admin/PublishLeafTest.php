<?php

namespace Tests\Feature\Admin;

use App\Models\Leaf;
use App\Models\TrimModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\MakesCatalogUploads;
use Tests\TestCase;

/**
 * Publishing a door — the endpoint that replaces three independent localStorage
 * writes with one transaction.
 */
class PublishLeafTest extends TestCase
{
    use MakesCatalogUploads, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /** Publish as the bench. Not named `post` — TestCase already owns that. */
    private function publish(array $payload, array $files = []): TestResponse
    {
        return $this->actingAs($this->bench())->post('/api/admin/leaves', array_merge([
            'payload' => json_encode($payload),
            'image' => $this->jpeg(),
        ], $files), ['Accept' => 'application/json']);
    }

    /**
     * A guest must get 401 AND json.
     *
     * This is the assertion that catches a specific trap: these are `web`
     * routes, so a request that did not send `Accept: application/json` takes
     * the browser path, where Laravel's handler redirects to a route named
     * `login` that does not exist — a 500 where the bench needs a 401 to know
     * it should show its sign-in screen. A plain fetch() sends `Accept: * / *`,
     * so that is the normal case, not an exotic one.
     */
    public function test_a_guest_is_refused_with_json_not_a_redirect(): void
    {
        $response = $this->post('/api/admin/leaves', []);

        $response->assertStatus(401);
        $this->assertStringContainsString('application/json', $response->headers->get('content-type'));
    }

    public function test_a_guest_without_an_accept_header_still_gets_401(): void
    {
        $this->call('POST', '/api/admin/leaves')->assertStatus(401);
    }

    public function test_it_publishes_a_door_with_no_trim_designs(): void
    {
        $this->publish(['leaf' => $this->leafPayload()])
            ->assertStatus(201)
            ->assertJsonPath('leaf.name.uz', 'Romb')
            ->assertJsonPath('leaf.origin', 'bench')
            ->assertJsonPath('leaf.overridden', false);

        $this->assertSame(1, Leaf::count());
        $this->assertSame(0, TrimModel::count());

        $leaf = Leaf::first();
        Storage::disk('public')->assertExists($leaf->image_path);
        $this->assertStringStartsWith('catalog/leaves/'.$leaf->id.'/image-', $leaf->image_path);
    }

    public function test_it_publishes_a_door_with_both_trim_designs(): void
    {
        $this->publish([
            'leaf' => $this->leafPayload(),
            'trims' => [
                $this->trimPayload('nalichnik', [$this->piece('shaft')]),
                $this->trimPayload('korona', [$this->piece('crown')]),
            ],
        ], ['trimSource' => $this->webp()])->assertStatus(201);

        $trims = TrimModel::all();
        $this->assertCount(2, $trims);
        $this->assertEqualsCanonicalizing(['nalichnik', 'korona'], $trims->pluck('category')->all());

        // Every design owns its own directory, so "is this file referenced?"
        // stays a question about one row.
        foreach ($trims as $trim) {
            $this->assertSame(Leaf::first()->id, $trim->owner_leaf_id);
            Storage::disk('public')->assertExists($trim->trim_source_path);
            $this->assertStringStartsWith('catalog/trims/'.$trim->id.'/trim-', $trim->trim_source_path);
        }
    }

    /**
     * The unique index on (owner_leaf_id, category) is what makes republishing
     * REPLACE rather than append. The frontend achieved this by minting ids as
     * `a-<leafId>-<category>` and doing string surgery on them.
     */
    public function test_republishing_replaces_the_designs_instead_of_appending(): void
    {
        $payload = [
            'leaf' => $this->leafPayload(),
            'trims' => [
                $this->trimPayload('nalichnik', [$this->piece('shaft')]),
                $this->trimPayload('korona', [$this->piece('crown')]),
            ],
        ];
        $this->publish($payload, ['trimSource' => $this->webp()])->assertStatus(201);
        $before = TrimModel::orderBy('id')->pluck('id')->all();

        $id = Leaf::first()->id;
        $this->actingAs($this->bench())->post("/api/admin/leaves/{$id}", [
            'payload' => json_encode($payload),
            'image' => $this->jpeg(),
            'trimSource' => $this->webp(),
        ], ['Accept' => 'application/json'])->assertStatus(200);

        $this->assertSame(1, Leaf::count());
        $this->assertSame(2, TrimModel::count());
        $this->assertSame($before, TrimModel::orderBy('id')->pluck('id')->all());
    }

    /**
     * "A design is independent once it is out in the catalog, and the finish
     * stage says so rather than quietly deleting something a customer may
     * already be choosing." (DoorBench.tsx:695-698)
     */
    public function test_a_category_absent_from_the_payload_is_left_alone(): void
    {
        $this->publish([
            'leaf' => $this->leafPayload(),
            'trims' => [
                $this->trimPayload('nalichnik', [$this->piece('shaft')]),
                $this->trimPayload('korona', [$this->piece('crown')]),
            ],
        ], ['trimSource' => $this->webp()])->assertStatus(201);

        $korona = TrimModel::where('category', 'korona')->first();
        $id = Leaf::first()->id;

        // Republish with the nalichnik only.
        $this->actingAs($this->bench())->post("/api/admin/leaves/{$id}", [
            'payload' => json_encode([
                'leaf' => $this->leafPayload(),
                'trims' => [$this->trimPayload('nalichnik', [$this->piece('shaft')])],
            ]),
            'image' => $this->jpeg(),
            'trimSource' => $this->webp(),
        ], ['Accept' => 'application/json'])->assertStatus(200);

        $still = TrimModel::where('category', 'korona')->first();
        $this->assertNotNull($still, 'the korona was deleted by a publish that did not mention it');
        $this->assertSame($korona->id, $still->id);
        $this->assertSame($korona->trim_source_path, $still->trim_source_path);
        Storage::disk('public')->assertExists($still->trim_source_path);
    }

    /** A piece may not belong to a design of the other category. */
    public function test_a_crown_cannot_be_published_as_a_nalichnik(): void
    {
        $this->publish([
            'leaf' => $this->leafPayload(),
            'trims' => [$this->trimPayload('nalichnik', [$this->piece('crown')])],
        ], ['trimSource' => $this->webp()])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload.trims.0.trimBoxes.0.role');
    }

    /**
     * Nudged geometry legitimately leaves [0,1] — the arrow pads clamp nothing
     * (DoorBench.tsx:532, RoomBench.tsx:204). A validator that rejected it
     * would refuse work the operator actually did.
     */
    public function test_geometry_outside_the_unit_square_is_accepted(): void
    {
        $this->publish([
            'leaf' => $this->leafPayload(),
            'trims' => [$this->trimPayload('nalichnik', [
                $this->piece('shaft', [
                    'x' => -0.04, 'y' => -0.02, 'w' => 0.09, 'h' => 1.05,
                    'points' => [
                        ['x' => -0.04, 'y' => -0.02], ['x' => 0.05, 'y' => -0.02],
                        ['x' => 0.05, 'y' => 1.03], ['x' => -0.04, 'y' => 1.03],
                    ],
                ]),
            ])],
        ], ['trimSource' => $this->webp()])->assertStatus(201);
    }

    public function test_garbage_geometry_is_rejected(): void
    {
        $this->publish([
            'leaf' => $this->leafPayload(),
            'trims' => [$this->trimPayload('nalichnik', [
                $this->piece('shaft', ['x' => 1e30]),
            ])],
        ], ['trimSource' => $this->webp()])->assertStatus(422);
    }

    /** Fewer than three points is not a shape, and both the bench and the
     *  renderer refuse it. */
    public function test_a_two_point_outline_is_rejected(): void
    {
        $this->publish([
            'leaf' => $this->leafPayload(),
            'trims' => [$this->trimPayload('nalichnik', [
                $this->piece('shaft', ['points' => [['x' => 0.1, 'y' => 0.1], ['x' => 0.2, 'y' => 0.2]]]),
            ])],
        ], ['trimSource' => $this->webp()])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload.trims.0.trimBoxes.0.points');
    }

    /** A malformed payload is the client's fault, not a server error. */
    public function test_a_payload_that_is_not_json_is_a_422_not_a_500(): void
    {
        $this->actingAs($this->bench())->post('/api/admin/leaves', [
            'payload' => '{not json',
            'image' => $this->jpeg(),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload');
    }

    /**
     * An absent colorIds means "sold in every colour, including ones registered
     * later" — so the pivot stays empty and the public API omits the key.
     */
    public function test_a_door_on_every_colour_keeps_an_empty_pivot(): void
    {
        $this->color('oq');
        $this->publish(['leaf' => $this->leafPayload(['colorMode' => 'all'])])->assertStatus(201);

        $this->assertCount(0, Leaf::first()->colors);
        $this->assertArrayNotHasKey('colorIds', $this->getJson('/api/catalog')->json('leaves.0'));
    }

    public function test_a_restricted_door_records_exactly_its_colours(): void
    {
        $this->color('oq');
        $this->color('kok');
        $this->publish(['leaf' => $this->leafPayload(['colorMode' => 'list', 'colorIds' => ['kok']])])
            ->assertStatus(201);

        $this->assertSame(['kok'], Leaf::first()->colors->pluck('id')->all());
    }

    public function test_an_unknown_colour_is_rejected(): void
    {
        $this->publish(['leaf' => $this->leafPayload(['colorMode' => 'list', 'colorIds' => ['nosuch']])])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload.leaf.colorIds.0');
    }

    public function test_publishing_moves_the_catalogue_version(): void
    {
        $before = $this->getJson('/api/catalog/version')->json('version');
        $this->publish(['leaf' => $this->leafPayload()])->assertStatus(201);

        $this->assertNotSame($before, $this->getJson('/api/catalog/version')->json('version'));
    }

    /**
     * A traced silhouette survives the round trip.
     *
     * `corners` cannot carry this: it is fixed at four points because the
     * homography is solved from exactly four correspondences. An outline has
     * no such limit, which is the whole reason it is a separate column.
     */
    public function test_a_door_keeps_the_silhouette_it_was_cut_with(): void
    {
        // An arched top: five points, which `corners` could never hold.
        // No whole numbers - JSON hands 1.0 back as int 1, and the round trip
        // being checked here is the column's, not PHP's type juggling.
        $shape = [
            ['x' => 0.02, 'y' => 0.18], ['x' => 0.5, 'y' => 0.01],
            ['x' => 0.98, 'y' => 0.18], ['x' => 0.98, 'y' => 0.99],
            ['x' => 0.02, 'y' => 0.99],
        ];

        $this->publish(['leaf' => $this->leafPayload(['shape' => $shape])])->assertStatus(201);

        $this->assertSame($shape, Leaf::first()->shape);

        $this->actingAs($this->bench())
            ->getJson('/api/admin/catalog')
            ->assertJsonPath('leaves.0.shape', $shape);
    }

    /** The showroom has no use for the polygon — the mask is already baked
     *  into the published image's alpha, and shipping it would only invite a
     *  second, disagreeing implementation of the same cut. */
    public function test_the_public_catalogue_does_not_carry_the_silhouette(): void
    {
        $this->publish(['leaf' => $this->leafPayload(['shape' => [
            ['x' => 0.02, 'y' => 0.2], ['x' => 0.98, 'y' => 0.2], ['x' => 0.5, 'y' => 0.99],
        ]])])->assertStatus(201);

        $this->getJson('/api/catalog')->assertJsonMissingPath('leaves.0.shape');
    }

    /** A door that is simply a rectangle stores nothing, so nothing is masked
     *  and its image stays opaque. */
    public function test_a_door_without_a_silhouette_stores_none(): void
    {
        $this->publish(['leaf' => $this->leafPayload()])->assertStatus(201);

        $this->assertNull(Leaf::first()->shape);
    }

    /**
     * Republishing without the key preserves what is stored; an explicit null
     * clears it. Same contract as keep_regions, and for the same reason: the
     * silent alternative erases an operator's tracing with no way to tell.
     */
    public function test_an_omitted_silhouette_preserves_and_an_explicit_null_clears(): void
    {
        $shape = [['x' => 0.02, 'y' => 0.2], ['x' => 0.98, 'y' => 0.2], ['x' => 0.5, 'y' => 0.99]];
        $this->publish(['leaf' => $this->leafPayload(['shape' => $shape])])->assertStatus(201);
        $id = Leaf::first()->id;

        $this->actingAs($this->bench())->post("/api/admin/leaves/{$id}", [
            'payload' => json_encode(['leaf' => $this->leafPayload()]),
            'image' => $this->jpeg(),
        ], ['Accept' => 'application/json'])->assertStatus(200);
        $this->assertSame($shape, Leaf::find($id)->shape, 'omitted should preserve');

        $this->actingAs($this->bench())->post("/api/admin/leaves/{$id}", [
            'payload' => json_encode(['leaf' => $this->leafPayload(['shape' => null])]),
            'image' => $this->jpeg(),
        ], ['Accept' => 'application/json'])->assertStatus(200);
        $this->assertNull(Leaf::find($id)->shape, 'explicit null should clear');
    }

    /** Two points enclose no area — the same floor a trim piece has. */
    public function test_a_two_point_silhouette_is_rejected(): void
    {
        $this->publish(['leaf' => $this->leafPayload(['shape' => [
            ['x' => 0.1, 'y' => 0.1], ['x' => 0.9, 'y' => 0.9],
        ]])])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload.leaf.shape');
    }
}
