import { create } from 'zustand';
import {
  ACTION_POINTS_PER_TURN,
  ARTILLERY_ACTION_COST,
  ARTILLERY_RANGE,
  BUILDINGS,
  GRID_SIZE,
  HIREABLE_UNITS,
  MAX_HIRES_PER_TURN,
  PLAYERS,
  ROCKET_LAUNCH_TURNS,
  UNIT_META,
  areNeighbors,
  getBuildingData,
  getBuildingFootprint,
  getEnemy,
  idToCoord,
  isInRange,
  makeCell,
} from '../lib/gameData.js';

export { GRID_SIZE, ROCKET_LAUNCH_TURNS };

export const ROCKET_DIRECTIONS = {
  p1: { row: -1, col: 0, label: 'up' },
  p2: { row: 1, col: 0, label: 'down' },
  player1: { row: -1, col: 0, label: 'up' },
  player2: { row: 1, col: 0, label: 'down' },
};

const ROCKET_SEGMENTS = ['nose', 'body', 'tail'];
const createRocketCellId = (row, col) => `${row}-${col}`;
const playerName = (player) => (player === 'p1' || player === 'player1' ? 'Игрок 1' : 'Игрок 2');
const sameCellId = (left, right) => String(left) === String(right);

const cloneGrid = (grid) => grid.map((cell) => ({
  ...cell,
  content: cell.content ? { ...cell.content } : null,
  marks: cell.marks ? [...cell.marks] : [],
  p1View: cell.p1View ? { ...cell.p1View } : { state: 'unknown' },
  p2View: cell.p2View ? { ...cell.p2View } : { state: 'unknown' },
}));

const appendLog = (state, message) => [
  `Ход ${state.turn}: ${message}`,
  ...state.log,
].slice(0, 10);

const makeUnit = (type, owner) => ({
  type,
  kind: 'unit',
  owner,
  ap: 1,
  cooldown: 0,
  hidden: type === 'saboteur',
});

const setKnownContent = (cell, player, content, turn = 1) => ({
  ...cell,
  [`${player}View`]: { state: content.kind, type: content.type, turnDetected: turn },
});

const revealCellTruthFor = (cell, player, turn) => {
  if (!cell.content) return { ...cell, [`${player}View`]: { state: 'empty', turnDetected: turn } };
  return setKnownContent(cell, player, cell.content, turn);
};

export function cellId(x, y) {
  return y * GRID_SIZE + x;
}

export function parseCellId(id) {
  if (typeof id === 'string' && id.includes('-')) {
    const [row, col] = id.split('-').map(Number);

    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      throw new Error(`Invalid cell id: ${id}`);
    }

    return { row, col, x: col, y: row };
  }

  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId < 0 || numericId >= GRID_SIZE * GRID_SIZE) {
    throw new Error(`Invalid cell id: ${id}`);
  }

  const x = numericId % GRID_SIZE;
  const y = Math.floor(numericId / GRID_SIZE);

  return { x, y, row: y, col: x };
}

export function createEmptyGrid(size = GRID_SIZE) {
  return Array.from({ length: size * size }, (_, id) => makeCell(id));
}

export const createGrid = (size = GRID_SIZE) => ({
  size,
  cells: Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const col = index % size;

    return {
      id: createRocketCellId(row, col),
      row,
      col,
      structure: null,
      unit: null,
    };
  }),
});

export function getFootprintCellIds(originId, type) {
  const { x, y } = parseCellId(originId);
  const { width, height } = getBuildingFootprint(type);
  const ids = [];

  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const nextX = x + dx;
      const nextY = y + dy;

      if (nextX >= GRID_SIZE || nextY >= GRID_SIZE) {
        throw new Error(`Cannot place ${type}: footprint cell ${nextX},${nextY} is outside the grid`);
      }

      ids.push(cellId(nextX, nextY));
    }
  }

  return ids;
}

export function getBuildingSegments(grid, buildingId) {
  return grid
    .filter((cell) => cell.content?.kind === 'building' && cell.content.buildingId === buildingId)
    .sort((a, b) => a.content.segmentIndex - b.content.segmentIndex);
}

export function isBuildingDestroyed(grid, buildingId) {
  return getBuildingSegments(grid, buildingId).length === 0;
}

export function placeBuilding(grid, originId, { type, owner }) {
  getBuildingData(type);
  const nextGrid = cloneGrid(grid);
  const ids = getFootprintCellIds(originId, type);
  const buildingId = `${owner}:${type}:${originId}`;

  ids.forEach((id) => {
    if (!nextGrid[id]) {
      throw new Error(`Cannot place ${type}: footprint cell ${id} is outside the grid`);
    }

    if (nextGrid[id].content) {
      throw new Error(`Cannot place ${type}: footprint cell ${id} is occupied`);
    }
  });

  ids.forEach((id, segmentIndex) => {
    const segment = {
      kind: 'building',
      type,
      owner,
      buildingId,
      segmentIndex,
      originId,
      damaged: false,
    };

    nextGrid[id] = setKnownContent({ ...nextGrid[id], content: segment }, owner, segment);
  });

  return nextGrid;
}

export function damageOrDestroyBuilding(grid, targetId) {
  const target = grid[targetId];

  if (target?.content?.kind !== 'building') {
    return grid;
  }

  const nextGrid = cloneGrid(grid);
  const segment = nextGrid[targetId].content;

  if (segment.damaged) {
    nextGrid[targetId] = { ...nextGrid[targetId], content: null };
  } else {
    nextGrid[targetId] = {
      ...nextGrid[targetId],
      content: { ...segment, damaged: true },
    };
  }

  return nextGrid;
}

export function engineerRepair(grid, targetId, engineerOwner) {
  const target = grid[targetId];

  if (target?.content?.kind !== 'building') {
    return grid;
  }

  if (engineerOwner && target.content.owner !== engineerOwner) {
    return grid;
  }

  const nextGrid = cloneGrid(grid);
  nextGrid[targetId] = {
    ...nextGrid[targetId],
    content: { ...nextGrid[targetId].content, damaged: false },
  };

  return nextGrid;
}

export function hasBuildingSegment(grid, owner, type) {
  return grid.some(
    (cell) => cell.content?.kind === 'building'
      && cell.content.owner === owner
      && cell.content.type === type,
  );
}

export function hasActiveBuilding(grid, owner, type) {
  return grid.some(
    (cell) => cell.content?.kind === 'building'
      && cell.content.owner === owner
      && cell.content.type === type
      && !cell.content.damaged,
  );
}

export function checkBaseWinCondition(grid, players = PLAYERS) {
  const alivePlayers = players.filter((player) => hasBuildingSegment(grid, player, 'base') || hasBuildingSegment(grid, player, 'hq'));

  if (alivePlayers.length === 1) {
    return { winner: alivePlayers[0], reason: 'enemy-base-destroyed' };
  }

  if (alivePlayers.length === 0) {
    return { winner: null, reason: 'mutual-base-destruction' };
  }

  return null;
}

export function hasActiveRocketSilo(grid, owner) {
  return hasActiveBuilding(grid, owner, 'rocketSilo');
}

const calculateIncome = (grid, player) => {
  const paidBuildingIds = new Set();

  return grid.reduce((income, cell) => {
    const segment = cell.content;

    if (segment?.kind !== 'building'
      || segment.owner !== player
      || segment.damaged
      || paidBuildingIds.has(segment.buildingId)) {
      return income;
    }

    paidBuildingIds.add(segment.buildingId);
    return income + (BUILDINGS[segment.type]?.income ?? 0);
  }, 0);
};

export function applyIncome(state, player) {
  const income = calculateIncome(state.grid, player);

  if (state.players) {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...(state.players[player] ?? { money: 0 }),
          money: (state.players[player]?.money ?? 0) + income,
        },
      },
    };
  }

  if (state.money) {
    return {
      ...state,
      money: { ...state.money, [player]: state.money[player] + income },
    };
  }

  return state;
}

export function canHireFrom(grid, originOrBuildingId, unitType, owner) {
  const segments = grid.filter((cell) => {
    const segment = cell.content;
    return segment?.kind === 'building'
      && segment.owner === owner
      && !segment.damaged
      && (segment.originId === originOrBuildingId || segment.buildingId === originOrBuildingId);
  });

  if (segments.length === 0) {
    return false;
  }

  const type = segments[0].content.type;
  return Boolean(BUILDINGS[type]?.hireUnits.includes(unitType));
}

export function revealTruthFor(grid, viewer, turn = 1) {
  return cloneGrid(grid).map((cell) => revealCellTruthFor(cell, viewer, turn));
}

const getRocketGridSize = (grid) => grid?.size ?? GRID_SIZE;

const getRocketCells = (grid) => {
  if (Array.isArray(grid)) {
    return grid.map((cell) => ({
      id: cell.id,
      row: cell.y,
      col: cell.x,
      structure: cell.content?.kind === 'building'
        ? { kind: cell.content.type, owner: cell.content.owner }
        : null,
    }));
  }

  return grid?.cells ?? [];
};

const isInsideGrid = (position, grid) => {
  const size = getRocketGridSize(grid);
  return position.row >= 0 && position.row < size && position.col >= 0 && position.col < size;
};

const findCellByPosition = (grid, row, col) => getRocketCells(grid)
  .find((cell) => cell.row === row && cell.col === col);

const findRocketSiloCells = (grid, player) =>
  getRocketCells(grid).filter(
    (cell) => cell.structure?.kind === 'rocketSilo' && cell.structure?.owner === player,
  );

const adjacentCells = (grid, sourceCells) => {
  const seen = new Set(sourceCells.map((cell) => String(cell.id)));
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

      const candidate = findCellByPosition(grid, position.row, position.col);
      if (candidate && !seen.has(String(candidate.id))) {
        seen.add(String(candidate.id));
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
  const direction = ROCKET_DIRECTIONS[player] ?? ROCKET_DIRECTIONS.p1;
  const siloCells = findRocketSiloCells(grid, player);

  if (siloCells.length === 0) {
    throw new Error(`Cannot launch rocket for ${player}: no rocket silo found.`);
  }

  const launchCells = siloCells.length >= ROCKET_SEGMENTS.length
    ? siloCells
    : [...siloCells, ...adjacentCells(grid, siloCells)];
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

  const direction = ROCKET_DIRECTIONS[player] ?? ROCKET_DIRECTIONS[rocket.owner] ?? ROCKET_DIRECTIONS.p1;
  const movedCells = rocket.cells.map((currentCellId) => {
    const { row, col } = parseCellId(currentCellId);
    return { row: row + direction.row, col: col + direction.col };
  });

  const escaped = movedCells.every((position) => !isInsideGrid(position, grid));
  const cellsStillOnGrid = movedCells
    .filter((position) => isInsideGrid(position, grid))
    .map((position) => {
      const cell = findCellByPosition(grid, position.row, position.col);
      if (cell) return cell.id;
      return Array.isArray(grid) ? cellId(position.col, position.row) : createRocketCellId(position.row, position.col);
    });

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

export const getRocketContent = (rockets, targetCellId) => {
  const rocket = rockets.find((candidate) =>
    ['flying', 'damaged'].includes(candidate.status)
    && candidate.cells.some((rocketCellId) => sameCellId(rocketCellId, targetCellId)),
  );

  if (!rocket) {
    return null;
  }

  const segmentIndex = rocket.cells.findIndex((rocketCellId) => sameCellId(rocketCellId, targetCellId));

  return {
    kind: 'rocket',
    rocketSegment: ROCKET_SEGMENTS[segmentIndex] ?? 'body',
    rocketId: rocket.rocketId,
    owner: rocket.owner,
    damaged: rocket.damagedCells.some((rocketCellId) => sameCellId(rocketCellId, targetCellId)),
  };
};

export const applyRocketHit = (rocket, targetCellId) => {
  if (!rocket
    || !['flying', 'damaged'].includes(rocket.status)
    || !rocket.cells.some((rocketCellId) => sameCellId(rocketCellId, targetCellId))) {
    return { rocket, result: 'miss' };
  }

  const segmentIndex = rocket.cells.findIndex((rocketCellId) => sameCellId(rocketCellId, targetCellId));
  const segment = ROCKET_SEGMENTS[segmentIndex] ?? 'body';
  const damagedCells = rocket.damagedCells.some((rocketCellId) => sameCellId(rocketCellId, targetCellId))
    ? rocket.damagedCells
    : [...rocket.damagedCells, targetCellId];
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

const canRecruitFromCell = (cell, player, unitType) => cell.content?.kind === 'building'
  && cell.content.owner === player
  && !cell.content.damaged
  && Boolean(BUILDINGS[cell.content.type]?.hireUnits.includes(unitType));

const withContent = (grid, id, content) => {
  grid[id] = setKnownContent({ ...grid[id], content }, content.owner, content);
};

const createInitialGrid = () => {
  let grid = createEmptyGrid();

  grid = placeBuilding(grid, 80, { type: 'hq', owner: 'p1' });
  grid = placeBuilding(grid, 92, { type: 'base', owner: 'p1' });
  grid = placeBuilding(grid, 88, { type: 'rocketSilo', owner: 'p1' });
  withContent(grid, 72, makeUnit('infantry', 'p1'));
  withContent(grid, 62, makeUnit('scout', 'p1'));
  withContent(grid, 83, makeUnit('engineer', 'p1'));
  withContent(grid, 73, makeUnit('artillery', 'p1'));
  withContent(grid, 84, makeUnit('saboteur', 'p1'));

  grid = placeBuilding(grid, 8, { type: 'hq', owner: 'p2' });
  grid = placeBuilding(grid, 7, { type: 'base', owner: 'p2' });
  grid = placeBuilding(grid, 0, { type: 'rocketSilo', owner: 'p2' });
  withContent(grid, 27, makeUnit('infantry', 'p2'));
  withContent(grid, 37, makeUnit('scout', 'p2'));
  withContent(grid, 17, makeUnit('engineer', 'p2'));
  withContent(grid, 26, makeUnit('artillery', 'p2'));
  withContent(grid, 16, makeUnit('saboteur', 'p2'));

  return grid;
};

export const initialState = {
  grid: createInitialGrid(),
  players: Object.fromEntries(PLAYERS.map((player) => [player, { money: 0 }])),
  currentPlayer: PLAYERS[0],
  rockets: [],
};

export const gameActions = {
  placeBuilding: (state, originId, building) => ({ ...state, grid: placeBuilding(state.grid, originId, building) }),
  damageOrDestroyBuilding: (state, targetId) => ({ ...state, grid: damageOrDestroyBuilding(state.grid, targetId) }),
  engineerRepair: (state, targetId, owner) => ({ ...state, grid: engineerRepair(state.grid, targetId, owner) }),
  applyIncome,
};

export function createGameStore(seedState = initialState) {
  let state = seedState;
  const listeners = new Set();

  return {
    getState: () => state,
    setState: (updater) => {
      state = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useGameStore = create((set, get) => ({
  turn: 1,
  phase: 'ACTION',
  activePlayer: 'p1',
  money: { p1: 40, p2: 40 },
  actionPoints: { p1: ACTION_POINTS_PER_TURN, p2: ACTION_POINTS_PER_TURN },
  rocketProgress: { p1: 0, p2: 0 },
  rockets: [],
  winner: null,
  selectedCell: null,
  buildMode: null,
  hiredThisTurn: { p1: 0, p2: 0 },
  log: ['Ход 1: партия началась, туман войны активен.'],
  grid: createInitialGrid(),

  selectCell: (id, sourceMode = 'own') => {
    const { grid, selectedCell, activePlayer, actionPoints, phase, buildMode } = get();
    if (phase !== 'ACTION' || get().winner) return;

    if (buildMode) {
      if (sourceMode === 'own') get().hireUnit(id);
      return;
    }

    const clicked = grid[id];
    const selected = selectedCell !== null ? grid[selectedCell] : null;

    if (selected?.content?.owner === activePlayer && selected.content.kind === 'unit') {
      const targetViewState = clicked[`${activePlayer}View`].state;
      const isTargetRevealed = targetViewState === 'unit' || targetViewState === 'building';
      const isOwnUnit = clicked.content?.owner === activePlayer;

      if (sourceMode === 'own' && isOwnUnit && clicked.content.kind === 'unit') {
        set({ selectedCell: id, buildMode: null });
        return;
      }

      if (selected.content.type === 'artillery' && sourceMode === 'enemy') {
        get().artilleryFire(id);
        return;
      }

      if (areNeighbors(selectedCell, id)) {
        if (clicked.content && clicked.content.owner !== activePlayer && isTargetRevealed) {
          get().attackTarget(id);
          return;
        }

        if (selected.content.type === 'scout' && sourceMode === 'enemy' && !isOwnUnit) {
          get().revealCell(id);
          return;
        }

        if (!clicked.content) {
          get().moveUnit(selectedCell, id);
          return;
        }
      }
    }

    if (sourceMode === 'own'
      && clicked.content?.owner === activePlayer
      && clicked.content.kind === 'unit'
      && clicked.content.ap > 0
      && actionPoints[activePlayer] > 0
      && (clicked.content.cooldown ?? 0) === 0) {
      set({ selectedCell: id, buildMode: null });
      return;
    }

    set({ selectedCell: null });
  },

  clearSelection: () => set({ selectedCell: null, buildMode: null }),

  setBuildMode: (unitType) => {
    if (!HIREABLE_UNITS.includes(unitType)) return;
    set({ buildMode: unitType, selectedCell: null });
  },

  hireUnit: (targetId) => {
    const { activePlayer, buildMode, grid, money, phase, hiredThisTurn } = get();
    if (!buildMode || phase !== 'ACTION') return;

    if (hiredThisTurn[activePlayer] >= MAX_HIRES_PER_TURN) {
      set((state) => ({ log: appendLog(state, `лимит найма на ход исчерпан: максимум ${MAX_HIRES_PER_TURN} юнита.`) }));
      return;
    }

    const cost = UNIT_META[buildMode].cost;
    if (money[activePlayer] < cost) {
      set((state) => ({ log: appendLog(state, `не хватает денег на ${UNIT_META[buildMode].label}: нужно $${cost}.`) }));
      return;
    }

    const targetCell = grid[targetId];
    const hasFriendlyRecruiterNear = grid.some((cell) => canRecruitFromCell(cell, activePlayer, buildMode)
      && areNeighbors(cell.id, targetId));

    if (targetCell.content || !hasFriendlyRecruiterNear) {
      set((state) => ({ log: appendLog(state, 'нанимать можно только в пустую соседнюю клетку возле своей базы или HQ.') }));
      return;
    }

    const newGrid = cloneGrid(grid);
    const unit = makeUnit(buildMode, activePlayer);
    newGrid[targetId] = setKnownContent({ ...newGrid[targetId], content: unit }, activePlayer, unit, get().turn);

    set((state) => ({
      grid: newGrid,
      buildMode: null,
      hiredThisTurn: {
        ...state.hiredThisTurn,
        [activePlayer]: state.hiredThisTurn[activePlayer] + 1,
      },
      money: { ...state.money, [activePlayer]: state.money[activePlayer] - cost },
      log: appendLog(state, `${playerName(activePlayer)} нанял ${UNIT_META[buildMode].label} на ${idToCoord(targetId)} за $${cost}.`),
    }));
  },

  revealCell: (id) => {
    const { activePlayer, grid, actionPoints, selectedCell, turn } = get();
    const scoutCell = selectedCell !== null ? grid[selectedCell] : null;

    if (!scoutCell?.content || scoutCell.content.type !== 'scout') {
      set((state) => ({ log: appendLog(state, 'для разведки выберите Разведчика.') }));
      return;
    }
    if (scoutCell.content.ap <= 0 || actionPoints[activePlayer] < 1) return;
    if (!areNeighbors(selectedCell, id)) {
      set((state) => ({ log: appendLog(state, 'разведчик видит только соседние клетки.') }));
      return;
    }

    const newGrid = cloneGrid(grid);
    newGrid[id] = revealCellTruthFor(newGrid[id], activePlayer, turn);
    newGrid[selectedCell].content.ap = 0;

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, `Разведчик вскрыл ${idToCoord(id)}.`),
    }));
  },

  moveUnit: (fromId, toId) => {
    const { grid, activePlayer, actionPoints } = get();
    const fromCell = grid[fromId];
    const toCell = grid[toId];

    if (!fromCell.content || fromCell.content.kind !== 'unit' || fromCell.content.owner !== activePlayer) return;
    if (fromCell.content.ap <= 0 || actionPoints[activePlayer] <= 0 || (fromCell.content.cooldown ?? 0) > 0) return;
    if (!areNeighbors(fromId, toId) || toCell.content) return;

    const unit = { ...fromCell.content, ap: 0 };
    const enemy = getEnemy(activePlayer);
    const enemyView = `${enemy}View`;
    const ownerView = `${activePlayer}View`;
    const enemyPrevView = fromCell[enemyView];
    const shouldLeaveGhost = enemyPrevView.state === 'unit' || enemyPrevView.state === 'building';
    const newGrid = cloneGrid(grid);

    newGrid[fromId] = {
      ...newGrid[fromId],
      content: null,
      [enemyView]: shouldLeaveGhost
        ? { state: 'ghost', lastType: unit.type, lastTurn: get().turn }
        : enemyPrevView,
      [ownerView]: { state: 'empty', turnDetected: get().turn },
    };

    newGrid[toId] = {
      ...newGrid[toId],
      content: unit,
      [ownerView]: { state: 'unit', type: unit.type, turnDetected: get().turn },
    };

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, `${playerName(activePlayer)} двинул ${UNIT_META[unit.type].label} ${idToCoord(fromId)} -> ${idToCoord(toId)}.`),
    }));
  },

  attackTarget: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, turn } = get();
    const attackerCell = selectedCell !== null ? grid[selectedCell] : null;
    const targetCell = grid[targetId];

    if (!attackerCell?.content || attackerCell.content.kind !== 'unit' || attackerCell.content.owner !== activePlayer) return;
    if (attackerCell.content.ap <= 0 || actionPoints[activePlayer] <= 0 || (attackerCell.content.cooldown ?? 0) > 0) return;
    if (!areNeighbors(selectedCell, targetId)) return;
    if (!targetCell.content || targetCell.content.owner === activePlayer) return;

    const targetViewState = targetCell[`${activePlayer}View`].state;
    if (targetViewState !== 'unit' && targetViewState !== 'building') return;

    let newGrid = cloneGrid(grid);
    const attackerType = attackerCell.content.type;
    const targetType = targetCell.content.type;
    const isCounterAttackPossible = targetCell.content.type === 'infantry';
    let message = `${UNIT_META[attackerType].label} атаковал ${UNIT_META[targetType].label} на ${idToCoord(targetId)}.`;

    if (targetCell.content.kind === 'unit') {
      newGrid[targetId].content = null;
      newGrid[targetId][`${activePlayer}View`] = { state: 'empty', turnDetected: turn };
      message = `${UNIT_META[attackerType].label} уничтожил ${UNIT_META[targetType].label} на ${idToCoord(targetId)}.`;

      if (isCounterAttackPossible) {
        newGrid[selectedCell].content = null;
        newGrid[selectedCell][`${getEnemy(activePlayer)}View`] = { state: 'empty', turnDetected: turn };
        message += ' Ответный удар: атакующий тоже погиб.';
      }
    } else {
      const buildingId = targetCell.content.buildingId;
      newGrid = damageOrDestroyBuilding(newGrid, targetId);
      newGrid[targetId] = revealCellTruthFor(newGrid[targetId], activePlayer, turn);
      message += newGrid[targetId].content ? ' Сегмент здания поврежден.' : ' Сегмент здания разрушен.';
      if (isBuildingDestroyed(newGrid, buildingId)) {
        message += ` ${UNIT_META[targetType].label} уничтожена полностью.`;
      }
    }

    if (newGrid[selectedCell].content) newGrid[selectedCell].content.ap = 0;
    const baseResult = checkBaseWinCondition(newGrid);

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      winner: baseResult?.winner ?? state.winner,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, baseResult?.winner
        ? `${message} ${playerName(baseResult.winner)} победил: база противника уничтожена.`
        : message),
    }));
  },

  artilleryFire: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, turn, rockets } = get();
    const artilleryCell = selectedCell !== null ? grid[selectedCell] : null;
    const targetCell = grid[targetId];

    if (!artilleryCell?.content || artilleryCell.content.owner !== activePlayer || artilleryCell.content.type !== 'artillery') return;
    if (artilleryCell.content.ap <= 0 || (artilleryCell.content.cooldown ?? 0) > 0) return;
    if (actionPoints[activePlayer] < ARTILLERY_ACTION_COST) return;
    if (!isInRange(selectedCell, targetId, ARTILLERY_RANGE) || selectedCell === targetId) {
      set((state) => ({ log: appendLog(state, `артиллерия бьёт только в радиусе ${ARTILLERY_RANGE} клеток.`) }));
      return;
    }
    if (targetCell.content?.owner === activePlayer) return;

    let newGrid = cloneGrid(grid);
    let nextRockets = rockets;
    let message = `Артиллерия дала слепой залп по ${idToCoord(targetId)}.`;
    const rocketContent = getRocketContent(rockets, targetId);

    if (rocketContent) {
      nextRockets = rockets.map((rocket) => {
        const { rocket: nextRocket, result, segment } = applyRocketHit(rocket, targetId);
        if (result !== 'miss') {
          message += result === 'rocket_destroyed'
            ? ` Критическое попадание по ракете (${segment}): цель уничтожена.`
            : ` Попадание по ракете (${segment}): сегмент поврежден.`;
        }
        return nextRocket;
      });
    } else if (!targetCell.content) {
      newGrid[targetId][`${activePlayer}View`] = { state: 'empty', turnDetected: turn };
      message += ' Промах: клетка была пустой.';
    } else if (targetCell.content.kind === 'unit') {
      message += ` Попадание: уничтожен ${UNIT_META[targetCell.content.type].label}.`;
      newGrid[targetId].content = null;
      newGrid[targetId][`${activePlayer}View`] = { state: 'empty', turnDetected: turn };
    } else {
      const targetType = targetCell.content.type;
      const buildingId = targetCell.content.buildingId;
      newGrid = damageOrDestroyBuilding(newGrid, targetId);
      newGrid[targetId] = revealCellTruthFor(newGrid[targetId], activePlayer, turn);
      message += newGrid[targetId].content
        ? ` Попадание по зданию ${UNIT_META[targetType].label}: сегмент поврежден.`
        : ` Попадание: сегмент здания ${UNIT_META[targetType].label} разрушен.`;
      if (isBuildingDestroyed(newGrid, buildingId)) {
        message += ` ${UNIT_META[targetType].label} уничтожена полностью.`;
      }
    }

    newGrid[selectedCell].content.ap = 0;
    newGrid[selectedCell].content.cooldown = 2;
    const baseResult = checkBaseWinCondition(newGrid);

    set((state) => ({
      grid: newGrid,
      rockets: nextRockets,
      selectedCell: null,
      winner: baseResult?.winner ?? state.winner,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - ARTILLERY_ACTION_COST },
      log: appendLog(state, baseResult?.winner
        ? `${message} ${playerName(baseResult.winner)} победил: база противника уничтожена.`
        : message),
    }));
  },

  nextTurn: () => {
    const { activePlayer, winner } = get();
    if (winner) return;

    const nextPlayer = getEnemy(activePlayer);
    const shouldAdvanceTurn = activePlayer === 'p2';

    set((state) => {
      const nextTurnNumber = shouldAdvanceTurn ? state.turn + 1 : state.turn;
      const resetGrid = state.grid.map((cell) => {
        if (cell.content?.owner !== nextPlayer || cell.content.kind !== 'unit') return cell;
        const nextCooldown = Math.max((cell.content.cooldown ?? 0) - 1, 0);
        return {
          ...cell,
          content: {
            ...cell.content,
            cooldown: nextCooldown,
            ap: nextCooldown > 0 ? 0 : 1,
          },
        };
      });

      let rocketWinner = state.winner;
      let rockets = state.rockets.map((rocket) => {
        const advanced = advanceRocket(resetGrid, rocket, nextPlayer);
        if (advanced.escaped) {
          rocketWinner = rocket.owner;
        }
        return advanced.rocket;
      });

      const rocketIsCharging = hasActiveRocketSilo(resetGrid, nextPlayer);
      const nextRocketValue = rocketIsCharging
        ? Math.min(state.rocketProgress[nextPlayer] + 1, ROCKET_LAUNCH_TURNS)
        : state.rocketProgress[nextPlayer];
      const rocketProgress = { ...state.rocketProgress, [nextPlayer]: nextRocketValue };
      const alreadyLaunched = rockets.some((rocket) => rocket.owner === nextPlayer && rocket.status !== 'destroyed');
      let launchedRocket = null;

      if (rocketIsCharging && nextRocketValue >= ROCKET_LAUNCH_TURNS && !alreadyLaunched) {
        launchedRocket = createRocketEntity({
          grid: resetGrid,
          player: nextPlayer,
          launchedTurn: nextTurnNumber,
          rocketId: `${nextPlayer}-rocket-${nextTurnNumber}`,
        });
        rockets = [...rockets, launchedRocket];
      }

      const newWinner = rocketWinner;
      const rocketMessage = launchedRocket
        ? `Ракета ${launchedRocket.rocketId} стартовала: ${describeRocketStatus(launchedRocket)}.`
        : rocketIsCharging
          ? `Ракетная шахта ${playerName(nextPlayer)} заряжается: ${nextRocketValue}/${ROCKET_LAUNCH_TURNS}.`
          : `у ${playerName(nextPlayer)} нет активной шахты - ядерный таймер стоит.`;

      return {
        grid: resetGrid,
        turn: nextTurnNumber,
        activePlayer: nextPlayer,
        selectedCell: null,
        buildMode: null,
        phase: 'TRANSITION',
        actionPoints: { ...state.actionPoints, [nextPlayer]: ACTION_POINTS_PER_TURN },
        hiredThisTurn: { ...state.hiredThisTurn, [nextPlayer]: 0 },
        rocketProgress,
        rockets,
        winner: newWinner,
        log: appendLog({ ...state, turn: nextTurnNumber }, newWinner
          ? `${playerName(newWinner)} вывел ракету за край карты. Партия окончена!`
          : `${rocketMessage} Управление переходит к ${playerName(nextPlayer)}.`),
      };
    });

    get().applyIncome(nextPlayer);
  },

  startActionPhase: () => set((state) => ({ phase: state.winner ? 'ACTION' : 'ACTION' })),

  applyIncome: (player = get().activePlayer) => {
    const { grid, winner } = get();
    if (winner) return;

    const income = calculateIncome(grid, player);

    set((state) => ({
      money: { ...state.money, [player]: state.money[player] + income },
      log: income > 0 ? appendLog(state, `${playerName(player)} получил $${income} с баз.`) : state.log,
    }));
  },
}));

export default useGameStore;
