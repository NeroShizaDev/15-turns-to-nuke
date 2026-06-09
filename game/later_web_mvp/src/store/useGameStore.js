export const GRID_SIZE = 10;
export const ROCKET_LAUNCH_TURNS = 15;

export const ROCKET_DIRECTIONS = {
  player1: { row: -1, col: 0, label: 'up' },
  player2: { row: 1, col: 0, label: 'down' },
};

const ROCKET_SEGMENTS = ['nose', 'body', 'tail'];

const createCellId = (row, col) => `${row}-${col}`;

export const parseCellId = (cellId) => {
  const [row, col] = String(cellId).split('-').map(Number);
  return { row, col };
};

const isInsideGrid = ({ row, col }, grid) => {
  const size = grid?.size ?? GRID_SIZE;
  return row >= 0 && row < size && col >= 0 && col < size;
};

export const createGrid = (size = GRID_SIZE) => ({
  size,
  cells: Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const col = index % size;

    return {
      id: createCellId(row, col),
      row,
      col,
      structure: null,
      unit: null,
    };
  }),
});

const findCell = (grid, cellId) => grid.cells.find((cell) => cell.id === cellId);

const findRocketSiloCells = (grid, player) =>
  grid.cells.filter(
    (cell) => cell.structure?.kind === 'rocketSilo' && cell.structure?.owner === player,
  );

const adjacentCells = (grid, sourceCells) => {
  const seen = new Set(sourceCells.map((cell) => cell.id));
  const candidates = [];

  sourceCells.forEach((cell) => {
    [
      { row: cell.row - 1, col: cell.col },
      { row: cell.row + 1, col: cell.col },
      { row: cell.row, col: cell.col - 1 },
      { row: cell.row, col: cell.col + 1 },
    ].forEach((position) => {
      if (!isInsideGrid(position, grid)) {
        return;
      }

      const candidate = findCell(grid, createCellId(position.row, position.col));
      if (candidate && !seen.has(candidate.id)) {
        seen.add(candidate.id);
        candidates.push(candidate);
      }
    });
  });

  return candidates;
};

const sortForDirection = (cells, direction) =>
  [...cells].sort((a, b) => {
    if (direction.row < 0) {
      return a.row - b.row || a.col - b.col;
    }
    if (direction.row > 0) {
      return b.row - a.row || a.col - b.col;
    }
    return a.col - b.col || a.row - b.row;
  });

export const createRocketEntity = ({ grid, player, launchedTurn, rocketId }) => {
  const direction = ROCKET_DIRECTIONS[player] ?? ROCKET_DIRECTIONS.player1;
  const siloCells = findRocketSiloCells(grid, player);

  if (siloCells.length === 0) {
    throw new Error(`Cannot launch rocket for ${player}: no rocket silo found.`);
  }

  const launchCells = [...siloCells, ...adjacentCells(grid, siloCells)];
  const sortedCells = sortForDirection(launchCells, direction).slice(0, ROCKET_SEGMENTS.length);

  return {
    rocketId,
    owner: player,
    cells: sortedCells.map((cell) => cell.id),
    launchedTurn,
    direction: direction.label,
    status: 'flying',
    damagedCells: [],
  };
};

export const advanceRocket = (grid, rocket, player = rocket.owner) => {
  if (!rocket || rocket.owner !== player || !['flying', 'damaged'].includes(rocket.status)) {
    return { rocket, escaped: false };
  }

  const direction = ROCKET_DIRECTIONS[player] ?? ROCKET_DIRECTIONS[rocket.owner];
  const movedCells = rocket.cells.map((cellId) => {
    const { row, col } = parseCellId(cellId);
    return { row: row + direction.row, col: col + direction.col };
  });

  const escaped = movedCells.every((position) => !isInsideGrid(position, grid));
  const cellsStillOnGrid = movedCells
    .filter((position) => isInsideGrid(position, grid))
    .map((position) => createCellId(position.row, position.col));

  return {
    rocket: {
      ...rocket,
      cells: cellsStillOnGrid,
      status: escaped ? 'escaped' : rocket.status,
    },
    escaped,
  };
};

export const describeRocketStatus = (rocket) => {
  if (!rocket) {
    return 'rocket not launched';
  }

  const cells = rocket.cells.length > 0 ? rocket.cells.join(', ') : 'off-grid';
  return `${rocket.status} ${rocket.direction} @ ${cells}`;
};

export const getRocketContent = (rockets, cellId) => {
  const rocket = rockets.find((candidate) =>
    ['flying', 'damaged'].includes(candidate.status) && candidate.cells.includes(cellId),
  );

  if (!rocket) {
    return null;
  }

  const segmentIndex = rocket.cells.indexOf(cellId);

  return {
    kind: 'rocket',
    rocketSegment: ROCKET_SEGMENTS[segmentIndex] ?? 'body',
    rocketId: rocket.rocketId,
    owner: rocket.owner,
    damaged: rocket.damagedCells.includes(cellId),
  };
};

export const applyRocketHit = (rocket, cellId) => {
  if (!rocket || !['flying', 'damaged'].includes(rocket.status) || !rocket.cells.includes(cellId)) {
    return { rocket, result: 'miss' };
  }

  const segmentIndex = rocket.cells.indexOf(cellId);
  const segment = ROCKET_SEGMENTS[segmentIndex] ?? 'body';
  const damagedCells = rocket.damagedCells.includes(cellId)
    ? rocket.damagedCells
    : [...rocket.damagedCells, cellId];
  const isCriticalHit = segment === 'nose' || damagedCells.length >= 2;

  return {
    rocket: {
      ...rocket,
      damagedCells,
      status: isCriticalHit ? 'destroyed' : 'damaged',
    },
    result: isCriticalHit ? 'rocket_destroyed' : 'rocket_damaged',
    segment,
  };
};

const createInitialState = () => ({
  currentTurn: 1,
  activePlayer: 'player1',
  grid: createGrid(),
  rocketProgress: {
    player1: 0,
    player2: 0,
  },
  rockets: [],
  winner: null,
  log: [],
});

let state = createInitialState();
const listeners = new Set();

const setState = (updater) => {
  state = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
  listeners.forEach((listener) => listener(state));
  return state;
};

export const getGameState = () => state;

export const subscribeGameStore = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useGameStore = {
  getState: getGameState,
  subscribe: subscribeGameStore,
  reset: () => setState(createInitialState()),
  placeRocketSilo: (player, cellIds) =>
    setState((current) => ({
      ...current,
      grid: {
        ...current.grid,
        cells: current.grid.cells.map((cell) =>
          cellIds.includes(cell.id)
            ? { ...cell, structure: { kind: 'rocketSilo', owner: player } }
            : cell,
        ),
      },
    })),
  addRocketProgress: (player, amount = 1) =>
    setState((current) => {
      const nextProgress = current.rocketProgress[player] + amount;
      const alreadyLaunched = current.rockets.some((rocket) => rocket.owner === player);
      const shouldLaunch = nextProgress >= ROCKET_LAUNCH_TURNS && !alreadyLaunched;
      const rocket = shouldLaunch
        ? createRocketEntity({
            grid: current.grid,
            player,
            launchedTurn: current.currentTurn,
            rocketId: `${player}-rocket-${current.currentTurn}`,
          })
        : null;

      return {
        ...current,
        rocketProgress: {
          ...current.rocketProgress,
          [player]: nextProgress,
        },
        rockets: rocket ? [...current.rockets, rocket] : current.rockets,
        log: rocket
          ? [...current.log, `${player} launched ${rocket.rocketId} from ${rocket.cells.join(', ')}`]
          : current.log,
      };
    }),
  endPlayerTurn: () =>
    setState((current) => {
      const player = current.activePlayer;
      let winner = current.winner;
      const rockets = current.rockets.map((rocket) => {
        const advanced = advanceRocket(current.grid, rocket, player);
        if (advanced.escaped) {
          winner = rocket.owner;
        }
        return advanced.rocket;
      });

      return {
        ...current,
        currentTurn: player === 'player2' ? current.currentTurn + 1 : current.currentTurn,
        activePlayer: player === 'player1' ? 'player2' : 'player1',
        rockets,
        winner,
      };
    }),
  artilleryFire: (targetCellId, attacker = state.activePlayer) =>
    setState((current) => {
      let hitLog = `${attacker} artillery fire at ${targetCellId}: miss`;
      const rockets = current.rockets.map((rocket) => {
        const { rocket: nextRocket, result, segment } = applyRocketHit(rocket, targetCellId);
        if (result !== 'miss') {
          hitLog = `${attacker} artillery fire at ${targetCellId}: ${result} (${segment})`;
        }
        return nextRocket;
      });

      return {
        ...current,
        rockets,
        log: [...current.log, hitLog],
      };
    }),
};
