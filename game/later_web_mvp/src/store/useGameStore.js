import { BUILDINGS, PLAYERS, getBuildingData, getBuildingFootprint } from '../lib/gameData.js';

export const GRID_SIZE = 10;

const DEFAULT_PLAYER_STATE = {
  money: 0,
};

export function cellId(x, y) {
  return `${x},${y}`;
}

export function parseCellId(id) {
  const [x, y] = id.split(',').map(Number);

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`Invalid cell id: ${id}`);
  }

  return { x, y };
}

export function createEmptyGrid(size = GRID_SIZE) {
  const grid = {};

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const id = cellId(x, y);
      grid[id] = { id, x, y, content: null, visibleTo: [] };
    }
  }

  return grid;
}

function cloneGrid(grid) {
  return Object.fromEntries(
    Object.entries(grid).map(([id, cell]) => [
      id,
      {
        ...cell,
        content: cell.content ? { ...cell.content } : null,
        visibleTo: cell.visibleTo ? [...cell.visibleTo] : [],
      },
    ]),
  );
}

export function getFootprintCellIds(originId, type) {
  const { x, y } = parseCellId(originId);
  const { width, height } = getBuildingFootprint(type);
  const ids = [];

  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      ids.push(cellId(x + dx, y + dy));
    }
  }

  return ids;
}

export function getBuildingSegments(grid, buildingId) {
  return Object.values(grid)
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
    nextGrid[id] = {
      ...nextGrid[id],
      content: {
        kind: 'building',
        type,
        owner,
        buildingId,
        segmentIndex,
        originId,
        damaged: false,
      },
    };
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
  return Object.values(grid).some(
    (cell) => cell.content?.kind === 'building'
      && cell.content.owner === owner
      && cell.content.type === type,
  );
}

export function hasActiveBuilding(grid, owner, type) {
  return Object.values(grid).some(
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

export function applyIncome(state, player) {
  const paidBuildingIds = new Set();
  const income = Object.values(state.grid).reduce((sum, cell) => {
    const segment = cell.content;

    if (segment?.kind !== 'building' || segment.owner !== player || segment.damaged || paidBuildingIds.has(segment.buildingId)) {
      return sum;
    }

    paidBuildingIds.add(segment.buildingId);
    return sum + (BUILDINGS[segment.type]?.income ?? 0);
  }, 0);

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...(state.players[player] ?? DEFAULT_PLAYER_STATE),
        money: (state.players[player]?.money ?? 0) + income,
      },
    },
  };
}

export function canHireFrom(grid, originOrBuildingId, unitType, owner) {
  const segments = Object.values(grid).filter((cell) => {
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
  return Boolean(BUILDINGS[type]?.hireUnits?.includes(unitType));
}

export function revealTruthFor(grid, viewer) {
  const nextGrid = cloneGrid(grid);

  Object.values(nextGrid).forEach((cell) => {
    const content = cell.content;

    if (content?.kind === 'building' && content.owner === viewer) {
      const ids = getFootprintCellIds(content.originId, content.type);
      ids.forEach((id) => {
        if (nextGrid[id] && !nextGrid[id].visibleTo.includes(viewer)) {
          nextGrid[id].visibleTo.push(viewer);
        }
      });
    }
  });

  return nextGrid;
}

export const initialState = {
  grid: createEmptyGrid(),
  players: Object.fromEntries(PLAYERS.map((player) => [player, { ...DEFAULT_PLAYER_STATE }])),
  currentPlayer: PLAYERS[0],
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

const useGameStore = createGameStore();

export default useGameStore;
