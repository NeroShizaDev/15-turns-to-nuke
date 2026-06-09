# Later Web MVP

This MVP uses a physical, grid-based nuclear rocket.
A completed launch no longer creates `rocketFlight.distanceRemaining`; it creates a rocket entity on the map:

```js
{ rocketId, owner, cells: [ids], launchedTurn, direction }
```

## Store responsibilities

`src/store/useGameStore.js` owns the rocket lifecycle:

- `rocketProgress[player] >= ROCKET_LAUNCH_TURNS` creates a rocket on the owner's rocket silo cells or adjacent launch cells.
- `advanceRocket(grid, rocket, player)` moves the owner's rocket one row toward the opponent edge on each owner turn.
- `winner` is set only when every segment of a flying rocket exits the opponent edge.
- `artilleryFire(targetCellId)` damages or destroys a rocket when the target cell contains one of its physical segments.

## Rendering responsibilities

`src/components/GameGrid.jsx` and `src/components/Cell.jsx` render rockets through cell content:

```js
content.kind === 'rocket'
content.rocketSegment
```

The UI status text reports rocket coordinates, direction, and status. It intentionally avoids using `→ distanceRemaining` as the main model because the rocket's position is now determined by its occupied grid cells.

## Rocket damage summary

See `../../docs/nuclear_rocket.md` for the canonical rules. In short: a nose hit destroys the rocket immediately, non-nose hits damage a segment, and two damaged segments destroy the rocket.
