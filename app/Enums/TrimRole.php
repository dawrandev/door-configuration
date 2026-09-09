<?php

namespace App\Enums;

/**
 * Which part of the architrave a traced piece is.
 *
 * All five are accepted even though the benches only OFFER three today:
 * DoorBench's chips are `[...ROLE_ORDER, 'extra']` = shaft, crown, extra
 * (DoorBench.tsx:20, adminKit.tsx:29). But a room measured before that
 * narrowing can still carry footL/footR, and reopening such a record
 * republishes them unchanged (DoorBench.tsx:281). Rejecting them here would
 * make older doors unsaveable.
 */
enum TrimRole: string
{
    case Shaft = 'shaft';
    case Crown = 'crown';
    case FootL = 'footL';
    case FootR = 'footR';
    case Extra = 'extra';

    /** @return string[] */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Which trim design a piece with this role belongs to.
     *
     * The split the frontend makes at DoorBench.tsx:26 and :691-692: the crown
     * is the korona, everything else is the nalichnik.
     */
    public function category(): TrimCategory
    {
        return $this === self::Crown ? TrimCategory::Korona : TrimCategory::Nalichnik;
    }
}
