<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A paint the workshop can actually spray.
 *
 * Add-only: no hidden flag, no edit path. Once a shade is mixed and named there
 * is no reason to take it from a door already wearing it.
 */
class DoorColor extends Model
{
    use HasFactory;

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['position' => 'integer'];
    }

    public function leaves(): BelongsToMany
    {
        return $this->belongsToMany(Leaf::class, 'leaf_color', 'color_id', 'leaf_id');
    }
}
