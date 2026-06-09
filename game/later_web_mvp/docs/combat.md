# Combat in the Web MVP

Building damage is resolved per footprint cell. Attacks target a concrete grid cell, not an abstract building HP pool.

When an attack hits a building segment:

1. If the segment is intact, mark that segment as `damaged: true`.
2. If the segment is already damaged, remove that segment from the cell.
3. Keep every other segment with the same `buildingId` unchanged.

There is no `BUILDING_MAX_HP` value that stands in for building size. Large buildings survive longer because they have more footprint cells, not because a single object has more HP. A building counts as destroyed only after no grid cells remain with its `buildingId`.

Engineers repair a specific damaged segment. Repairing one cell does not automatically repair the rest of the footprint.
