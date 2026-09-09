<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * An interior photograph with the doorway it already has.
 *
 * `open`, `light` and `trim_boxes` are opaque render inputs — handed straight to
 * the compositor, never filtered or joined on. `trim_boxes` in particular keeps
 * its point order, which is load-bearing: the renderer's winding maths reads the
 * sequence, and a normalised table that lost its ORDER BY would corrupt a traced
 * shape with nothing thrown.
 */
class Room extends Model
{
    use HasFactory;

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'aspect' => 'float',
            'open' => 'array',
            'trim_boxes' => 'array',
            'light' => 'array',
            'box' => 'array',
            'overridden' => 'boolean',
            'hidden' => 'boolean',
            'position' => 'integer',
        ];
    }
}
