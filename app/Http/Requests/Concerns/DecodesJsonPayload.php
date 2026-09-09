<?php

namespace App\Http\Requests\Concerns;

use JsonException;

/**
 * The benches send one multipart request: a text part named `payload` holding
 * the whole JSON document, plus the image parts beside it.
 *
 * Base64-in-JSON was rejected (docs/decisions.md): it costs a third more bytes,
 * makes PHP hold the whole string in memory before it can be decoded, and gives
 * up UploadedFile — meaning no `mimetypes:` rule, no `max:` rule, and no
 * streaming for a 40MB room photograph.
 */
trait DecodesJsonPayload
{
    protected function prepareForValidation(): void
    {
        $raw = $this->input('payload');

        if (! is_string($raw)) {
            return;
        }

        try {
            // A depth bound, because the validator will walk whatever it is
            // handed. The deepest legitimate path is seven levels
            // (payload.trims.0.trimBoxes.0.points.0.x).
            $this->merge(['payload' => json_decode($raw, true, 64, JSON_THROW_ON_ERROR)]);
        } catch (JsonException) {
            // Left as a string deliberately. `payload => array` then fails and
            // the client gets a 422; throwing here would make a malformed
            // request a 500.
        }
    }
}
