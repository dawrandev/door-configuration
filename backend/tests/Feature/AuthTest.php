<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Sign-in for the workshop bench.
 *
 * The point being defended is the DATA, not the route: #/admin is a hash and
 * never reaches the server, so what actually keeps a stranger out is that every
 * write is behind `auth`. These tests are about that boundary.
 */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function bench(string $password = 'correct-horse'): User
    {
        return User::create([
            'name' => 'Ustaxona',
            'email' => 'bench@dawran.local',
            'password' => Hash::make($password),
        ]);
    }

    protected function tearDown(): void
    {
        RateLimiter::clear(strtolower('bench@dawran.local').'|127.0.0.1');
        parent::tearDown();
    }

    public function test_me_is_401_when_nobody_is_signed_in(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_a_correct_password_signs_in(): void
    {
        $this->bench();

        $this->postJson('/api/auth/login', [
            'email' => 'bench@dawran.local',
            'password' => 'correct-horse',
        ])->assertStatus(204);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJson(['email' => 'bench@dawran.local']);
    }

    public function test_a_wrong_password_is_rejected(): void
    {
        $this->bench();

        $this->postJson('/api/auth/login', [
            'email' => 'bench@dawran.local',
            'password' => 'wrong',
        ])->assertStatus(422);

        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    /**
     * The same message either way, so this cannot be used to discover which
     * accounts exist.
     */
    public function test_an_unknown_email_fails_the_same_way_as_a_wrong_password(): void
    {
        $this->bench();

        $unknown = $this->postJson('/api/auth/login', [
            'email' => 'nobody@dawran.local',
            'password' => 'correct-horse',
        ])->assertStatus(422)->json('errors.email');

        RateLimiter::clear(strtolower('nobody@dawran.local').'|127.0.0.1');

        $wrong = $this->postJson('/api/auth/login', [
            'email' => 'bench@dawran.local',
            'password' => 'wrong',
        ])->assertStatus(422)->json('errors.email');

        $this->assertSame($unknown, $wrong);
    }

    public function test_logging_out_ends_the_session(): void
    {
        $this->bench();
        $this->actingAs(User::first());

        $this->postJson('/api/auth/logout')->assertStatus(204);
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    /**
     * Throttled per email+IP rather than per IP alone. A showroom is one IP, so
     * an IP-only limit would let one salesperson's typo lock out everyone else
     * on the floor.
     */
    public function test_repeated_failures_are_throttled_for_that_email(): void
    {
        $this->bench();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'bench@dawran.local',
                'password' => 'wrong',
            ])->assertStatus(422);
        }

        // Now even the RIGHT password is refused, and the message says so.
        $errors = $this->postJson('/api/auth/login', [
            'email' => 'bench@dawran.local',
            'password' => 'correct-horse',
        ])->assertStatus(422)->json('errors.email.0');

        $this->assertStringContainsString('seconds', strtolower($errors));

        // A different account on the same IP is unaffected.
        $this->postJson('/api/auth/login', [
            'email' => 'someone-else@dawran.local',
            'password' => 'whatever',
        ])->assertStatus(422)->assertJsonMissing(['errors' => ['email' => ['seconds']]]);
        RateLimiter::clear(strtolower('someone-else@dawran.local').'|127.0.0.1');
    }

    public function test_the_catalogue_stays_readable_without_signing_in(): void
    {
        $this->getJson('/api/catalog')->assertOk();
        $this->getJson('/api/catalog/version')->assertOk();
    }
}
