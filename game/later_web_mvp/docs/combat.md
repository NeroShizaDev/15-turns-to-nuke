# Combat in the Web MVP

Battleship rules with bases. Each player has a separate 10×10 board (`state.boards.p1`, `state.boards.p2`). Units stand on their owner's board and shoot at the enemy board using the same coordinates: a unit on Д4 reaches enemy cells within its range around Д4.

There are no hit points. `resolveShot` in `src/lib/rules.js` handles one target cell:

1. A flying enemy rocket covering the cell takes the hit first; two hit rocket cells destroy it.
2. Empty cell: miss. The attacker's `seen` becomes `{ state: 'empty', shot: 'miss' }`, the defender gets `shot: 'miss'`.
3. Unit: killed outright. A harvester with cargo leaves a ruin holding the cargo.
4. Building segment: that cell is removed and becomes a ruin with the segment's salvage; the rest of the footprint stays. If storage capacity drops below the owner's money, the excess spills into the ruin.
5. Ruin: half of the salvage scatters.

A building is destroyed only after every footprint cell is gone. Large buildings survive longer because they have more cells, not because of an HP pool.

Ranges and costs live in `UNIT_META` (`src/lib/gameData.js`): infantry 1 / 1 AP, scout 3 / 1 AP (reveal only), saboteur 1 / 2 AP (steal), artillery 4 / 2 AP plus a 4-own-turn cooldown. Infantry hitting infantry dies too.

Engineers rebuild a destroyed cell of a still-standing building from its ruin (`repair`), paying $5 plus any salvage already hauled away.
