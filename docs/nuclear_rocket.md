# Physical nuclear rocket model

The nuclear rocket is a physical grid entity, not a countdown expressed as `distanceRemaining`.
The gameplay state stores each launched rocket with this shape:

```js
{ rocketId, owner, cells: [ids], launchedTurn, direction }
```

The MVP may keep extra runtime fields such as `status` and `damagedCells`, but the identity and movement of the rocket are defined by the fields above.

## Launch

A player accumulates `rocketProgress[player]` until it reaches `ROCKET_LAUNCH_TURNS`.
When the threshold is reached, the game creates one rocket entity for that player instead of creating a flight object with `distanceRemaining`.

Placement rules:

1. Prefer cells occupied by the owner's `rocketSilo` structure.
2. If the silo footprint cannot provide launch cells, use adjacent cells next to the silo.
3. The rocket is represented by up to three ordered segments: `nose`, `body`, and `tail`.
4. The stored `cells` array contains the current grid cell ids for those segments.

## Movement

`advanceRocket(grid, rocket, player)` runs once on the owner's turn.
The rocket moves one row in its stored direction:

- `player1` moves upward toward row `-1`.
- `player2` moves downward toward row `grid.size`.

Segments that have not crossed the edge remain on the grid. A rocket wins only when all of its segments have crossed the opponent edge. Partial edge crossing is not enough to set `winner`.

## Victory

The game sets `winner` only after a physical rocket fully exits through the opponent edge.
Progress completion alone does not win the game, and a launched rocket can still be damaged or destroyed before it leaves the grid.

## Artillery interaction

`artilleryFire` checks whether the target cell contains a rocket segment through `content.kind === 'rocket'` / `rocketSegment`.
If the target is not a rocket segment, the artillery shot resolves as a normal miss for the rocket system.

If the target cell contains a rocket segment:

1. A hit on `nose` is a critical hit and destroys the rocket immediately.
2. A hit on any other intact segment marks that segment as damaged.
3. Two damaged rocket cells destroy the rocket.
4. Destroyed rockets stop moving and cannot trigger `winner`.

These rules keep the rocket counter-play visible on the same grid used for construction, scouting, and artillery.

## UI requirements

The grid renderer should show rocket cells as physical content:

```js
content.kind === 'rocket'
content.rocketSegment // "nose" | "body" | "tail"
```

The user interface should show the rocket id, owner, current coordinates, direction, and status.
It should not present `→ distanceRemaining` as the primary flight model.
