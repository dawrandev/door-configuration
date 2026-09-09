<?php

namespace App\Enums;

/**
 * Where a catalogue item came from, and therefore what deleting it means.
 *
 * This column replaces the frontend's `a-` id-prefix convention
 * (adminStore.ts:243). The prefix is still how new bench ids are SHAPED, but
 * nothing reads it any more: a shipped door whose id happens to start with `a-`
 * would have broken every one of those checks.
 */
enum Origin: string
{
    /** Shipped by the offline pipeline. Its pixels are in the seed, so it can be
     *  hidden but never deleted — there would be nothing to delete. */
    case Builtin = 'builtin';

    /** Added at the bench. Deleting it really removes it. */
    case Bench = 'bench';
}
