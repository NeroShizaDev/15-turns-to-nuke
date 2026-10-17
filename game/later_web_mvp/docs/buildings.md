# Buildings in the Web MVP

Buildings are represented by a footprint instead of a single content object. `BUILDINGS` in `src/lib/gameData.js` defines the occupied rectangle:

- `hq`: `2 × 2`
- `rocketSilo`: `2 × 2` (only in the bottom 3 rows)
- `barracks`: `2 × 1`
- `base`: `1 × 1`
- `depot`: `1 × 1`

Placing a building writes one segment into every occupied cell of its owner's board. Each segment stores:

- `kind: 'building'`
- `type`
- `owner`
- `buildingId`
- `segmentIndex`
- `originId`

`buildingId` links all footprint cells that belong to the same building. `originId` is the top-left placement cell, and `segmentIndex` is stable within the footprint.

There is no damaged state: one hit removes a segment and leaves a ruin `{ kind: 'ruin', salvage, from: { buildingId, type, segmentIndex, originId } }`. Income and storage are summed per remaining segment, so an HQ with 3 of 4 cells gives 3/4 of its income. A building is destroyed only when no cells with its `buildingId` remain.
