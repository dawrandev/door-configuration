<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A door leaf.
 *
 * The primary key is the catalogue id, a string — so $incrementing and $keyType
 * both have to be set. Forgetting either makes Eloquent cast ids to integers,
 * and 'lattice' becomes 0: every lookup then silently matches the wrong row or
 * nothing at all.
 */
class Leaf extends Model
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
            'handle_at' => 'array',
            'corners' => 'array',
            'keep_regions' => 'array',
            'trim_roles' => 'array',
            'handle_swappable' => 'boolean',
            'white' => 'boolean',
            'overridden' => 'boolean',
            'hidden' => 'boolean',
            'position' => 'integer',
        ];
    }

    /** The paints this model is sold in. Empty when color_mode is 'all'. */
    public function colors(): BelongsToMany
    {
        return $this->belongsToMany(DoorColor::class, 'leaf_color', 'leaf_id', 'color_id');
    }

    /**
     * The nalichnik/korona designs traced from this door's own photograph.
     *
     * At most two — one per category, enforced by a unique index rather than by
     * the id-string convention the frontend used.
     */
    public function trims(): HasMany
    {
        return $this->hasMany(TrimModel::class, 'owner_leaf_id');
    }
}
