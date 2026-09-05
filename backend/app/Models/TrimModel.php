<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A nalichnik or korona design, chosen independently of the door and the room.
 *
 * `owner_leaf_id` + the unique index on (owner_leaf_id, category) is what makes
 * republishing a door REPLACE its two designs rather than append a second pair.
 * The frontend achieved that by minting ids as `a-<leafId>-<category>` and doing
 * string surgery on them; here the database enforces it.
 */
class TrimModel extends Model
{
    use HasFactory;

    protected $table = 'trim_models';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'trim_margin' => 'array',
            'trim_boxes' => 'array',
            'corners' => 'array',
            'overridden' => 'boolean',
            'hidden' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function ownerLeaf(): BelongsTo
    {
        return $this->belongsTo(Leaf::class, 'owner_leaf_id');
    }
}
