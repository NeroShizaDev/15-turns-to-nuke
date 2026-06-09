# Buildings in the Web MVP

Buildings are represented by a footprint instead of a single content object. The building metadata in `gameData.js` defines the occupied rectangle:

- `hq`: `2 × 2`
- `rocketSilo`: `2 × 2`
- `base`: `1 × 1`

Placing a building writes one segment into every occupied grid cell. Each segment stores:

- `kind: 'building'`
- `type`
- `owner`
- `buildingId`
- `segmentIndex`
- `originId`
- `damaged`

`buildingId` links all footprint cells that belong to the same building. `originId` is the top-left placement cell, and `segmentIndex` is stable within the footprint. Rendering should use these segment fields rather than assuming that one cell equals one complete building.

A building is destroyed only when all of its segments have been removed from the grid. Losing one segment damages the footprint tactically, but the remaining segments still identify the same building through `buildingId`.
