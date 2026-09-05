<?php

namespace App\Enums;

/**
 * The two independent customer picks. Neither implies the other, and a design
 * belongs to exactly one — TrimBench lets an operator move a design between
 * them, so a korona must never come back as a nalichnik.
 */
enum TrimCategory: string
{
    case Nalichnik = 'nalichnik';
    case Korona = 'korona';

    /** @return string[] */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
