import { create } from 'zustand';
import {
  ACTION_POINTS_PER_TURN,
  ARTILLERY_ACTION_COST,
  ARTILLERY_COOLDOWN_OWN_TURNS,
  ARTILLERY_RANGE,
  BUILDING_META,
  ENGINEER_REPAIR_COST,
  GRID_SIZE,
  HIREABLE_UNITS,
  MAX_HIRES_PER_TURN,
  ROCKET_LAUNCH_TURNS,
  ROCKET_META,
  SABOTEUR_ACTION_COST,
  SABOTEUR_STEAL_AMOUNT,
  UNIT_META,
  areNeighbors,
  getEnemy,
  idToCoord,
  isInRange,
  isInsideGrid,
  makeCell,
  xyToId,
} from '../lib/gameData.js';

const playerName = (player) => (player === 'p1' ? 'Игрок 1' : 'Игрок 2');
const STARTING_MONEY = 40;
const ARTILLERY_COOLDOWN_VALUE = ARTILLERY_COOLDOWN_OWN_TURNS + 1;

const cloneGrid = (grid) => grid.map((cell) => ({
  ...cell,
  content: cell.content ? { ...cell.content } : null,
  marks: [...cell.marks],
}));

const appendLog = (state, message) => [
  `Ход ${state.turn}: ${message}`,
  ...state.log,
].slice(0, 10);

const normalizeTurn = (turn) => {
  if (typeof turn === 'object') return 1;
  return Number(turn) || 1;
};

const setKnownContent = (cell, player, content, turn = 1) => ({
  ...cell,
  [`${player}View`]: {
    state: content.kind,
    type: content.type,
    turnDetected: normalizeTurn(turn),
  },
});

const getFootprintIds = (originId, footprint) => {
  const originX = originId % GRID_SIZE;
  const originY = Math.floor(originId / GRID_SIZE);
  const ids = [];

  for (let y = 0; y < footprint.height; y += 1) {
    for (let x = 0; x < footprint.width; x += 1) {
      const cellX = originX + x;
      const cellY = originY + y;
      if (!isInsideGrid(cellX, cellY)) return [];
      ids.push(xyToId(cellX, cellY));
    }
  }

  return ids;
};

const makeUnit = (type, owner) => ({
  type,
  kind: 'unit',
  owner,
  ap: 1,
  cooldown: 0,
  hasMoved: false,
  hidden: type === 'saboteur',
});

const placeUnit = (grid, id, type, owner, turn = 1) => {
  const unit = makeUnit(type, owner);
  grid[id] = setKnownContent({ ...grid[id], content: unit }, owner, unit, turn);
};

const placeBuilding = (grid, originId, type, owner, turn = 1) => {
  const footprint = BUILDING_META[type];
  const ids = getFootprintIds(originId, footprint);
  if (ids.length !== footprint.width * footprint.height) return;
  if (ids.some((id) => grid[id].content)) return;

  const buildingId = `${owner}-${type}-${originId}`;

  ids.forEach((id, segmentIndex) => {
    const segment = {
      type,
      kind: 'building',
      owner,
      buildingId,
      originId,
      segmentIndex,
      damaged: false,
    };
    grid[id] = setKnownContent({ ...grid[id], content: segment }, owner, segment, turn);
  });
};

const createRocketSegment = (rocketId, owner, originId, segmentIndex, launchedTurn) => ({
  type: 'nuclearRocket',
  kind: 'rocket',
  owner,
  rocketId,
  originId,
  segmentIndex,
  damaged: false,
  launchedTurn,
});

const placeRocket = (grid, originId, owner, turn) => {
  const footprint = ROCKET_META.nuclearRocket;
  const ids = getFootprintIds(originId, footprint);
  if (ids.length !== footprint.width * footprint.height) return null;
  if (ids.some((id) => grid[id].content && grid[id].content.owner !== owner)) return null;

  const rocketId = `${owner}-rocket-${turn}`;
  ids.forEach((id, segmentIndex) => {
    const segment = createRocketSegment(rocketId, owner, originId, segmentIndex, turn);
    grid[id] = setKnownContent({ ...grid[id], content: segment }, owner, segment, turn);
    grid[id] = setKnownContent(grid[id], getEnemy(owner), segment, turn);
  });

  return { rocketId, owner, originId, launchedTurn: turn };
};

const revealTruthFor = (cell, player, turn) => {
  if (!cell.content) return { ...cell, [`${player}View`]: { state: 'empty', turnDetected: normalizeTurn(turn) } };
  return setKnownContent(cell, player, cell.content, turn);
};

const applySaboteurDetection = (grid, turn) => {
  let updatedGrid = grid;

  ['p1', 'p2'].forEach((player) => {
    const enemy = getEnemy(player);
    const enemyViewKey = `${enemy}View`;

    updatedGrid = updatedGrid.map((cell) => {
      if (cell.content?.owner !== player || cell.content.type !== 'saboteur') return cell;

      const hasEnemyAdjacent = updatedGrid.some((adjacent) => adjacent.content?.owner === enemy
        && adjacent.content.kind === 'unit'
        && areNeighbors(adjacent.id, cell.id));

      if (!hasEnemyAdjacent) return cell;

      return {
        ...cell,
        [enemyViewKey]: { state: 'unit', type: 'saboteur', turnDetected: normalizeTurn(turn) },
      };
    });
  });

  return updatedGrid;
};

const damageSegment = (cell) => {
  if (!cell.content) return cell;
  if (cell.content.kind !== 'building' && cell.content.kind !== 'rocket') return cell;

  if (!cell.content.damaged) {
    return {
      ...cell,
      content: { ...cell.content, damaged: true },
      marks: [...cell.marks, '×'],
    };
  }

  return {
    ...cell,
    content: null,
    marks: [...cell.marks, '×'],
  };
};

const hasStructure = (grid, player, type) => grid.some(
  (cell) => cell.content?.owner === player && cell.content.type === type,
);

const hasProductionBuilding = (grid, player) => grid.some(
  (cell) => cell.content?.owner === player
    && cell.content.type === 'barracks'
    && !cell.content.damaged,
);

const hasActiveRocketSilo = (grid, player) => hasStructure(grid, player, 'rocketSilo');

const checkBaseWinCondition = (grid) => {
  const hasP1Bases = grid.some((cell) => cell.content?.owner === 'p1'
    && (cell.content.type === 'base' || cell.content.type === 'hq'));
  const hasP2Bases = grid.some((cell) => cell.content?.owner === 'p2'
    && (cell.content.type === 'base' || cell.content.type === 'hq'));

  if (!hasP1Bases && hasP2Bases) return 'p2';
  if (!hasP2Bases && hasP1Bases) return 'p1';
  return null;
};

const isConfirmedTarget = (cell, player) => {
  const viewState = cell[`${player}View`].state;
  return viewState === 'unit' || viewState === 'building' || viewState === 'rocket';
};

const createInitialGrid = () => {
  const grid = Array.from({ length: 100 }, (_, id) => makeCell(id));

  placeBuilding(grid, 80, 'hq', 'p1');
  placeBuilding(grid, 92, 'base', 'p1');
  placeBuilding(grid, 88, 'rocketSilo', 'p1');
  placeBuilding(grid, 70, 'barracks', 'p1');
  placeUnit(grid, 72, 'infantry', 'p1');
  placeUnit(grid, 62, 'scout', 'p1');
  placeUnit(grid, 83, 'engineer', 'p1');
  placeUnit(grid, 73, 'artillery', 'p1');
  placeUnit(grid, 84, 'saboteur', 'p1');

  placeBuilding(grid, 0, 'hq', 'p2');
  placeBuilding(grid, 7, 'base', 'p2');
  placeBuilding(grid, 8, 'rocketSilo', 'p2');
  placeBuilding(grid, 28, 'barracks', 'p2');
  placeUnit(grid, 27, 'infantry', 'p2');
  placeUnit(grid, 37, 'scout', 'p2');
  placeUnit(grid, 17, 'engineer', 'p2');
  placeUnit(grid, 26, 'artillery', 'p2');
  placeUnit(grid, 16, 'saboteur', 'p2');

  return grid;
};

const getIncome = (grid, player) => {
  const counted = new Set();
  return grid.reduce((acc, cell) => {
    const content = cell.content;
    if (content?.owner !== player || content.kind !== 'building') return acc;
    if (counted.has(content.buildingId)) return acc;
    counted.add(content.buildingId);
    return acc + (BUILDING_META[content.type]?.income ?? 0);
  }, 0);
};

const getRocketOrigin = (grid, player) => {
  const silo = grid.find((cell) => cell.content?.owner === player && cell.content.type === 'rocketSilo');
  return silo?.content?.originId ?? null;
};

const getRocketCells = (grid, rocketId) => grid.filter((cell) => cell.content?.rocketId === rocketId);

const moveRocket = (grid, rocket, turn) => {
  const currentCells = getRocketCells(grid, rocket.rocketId);
  if (currentCells.length === 0) return { grid, rocket: null, winner: null, message: 'ракета сбита.' };

  const dy = rocket.owner === 'p1' ? -1 : 1;
  const nextPositions = currentCells.map((cell) => ({ x: cell.x, y: cell.y + dy, oldId: cell.id }));
  const reachedEdge = nextPositions.some(({ y }) => y < 0 || y >= GRID_SIZE);

  if (reachedEdge) {
    const clearedGrid = grid.map((cell) => (
      cell.content?.rocketId === rocket.rocketId ? { ...cell, content: null } : cell
    ));
    return {
      grid: clearedGrid,
      rocket: null,
      winner: rocket.owner,
      message: `${playerName(rocket.owner)} довёл ядерную ракету до края карты противника.`,
    };
  }

  const nextIds = nextPositions.map(({ x, y }) => xyToId(x, y));
  if (nextIds.some((id) => grid[id].content && grid[id].content.rocketId !== rocket.rocketId)) {
    return { grid, rocket, winner: null, message: 'ракета заблокирована целью на траектории.' };
  }

  const newOriginId = Math.min(...nextIds);
  const nextByOldId = new Map(nextPositions.map((position) => [position.oldId, xyToId(position.x, position.y)]));
  let movedGrid = grid.map((cell) => (
    cell.content?.rocketId === rocket.rocketId ? { ...cell, content: null } : cell
  ));

  currentCells.forEach((cell) => {
    const nextId = nextByOldId.get(cell.id);
    const segment = { ...cell.content, originId: newOriginId };
    movedGrid[nextId] = setKnownContent({ ...movedGrid[nextId], content: segment }, rocket.owner, segment, turn);
    movedGrid[nextId] = setKnownContent(movedGrid[nextId], getEnemy(rocket.owner), segment, turn);
  });

  return {
    grid: movedGrid,
    rocket: { ...rocket, originId: newOriginId },
    winner: null,
    message: `Ракета ${playerName(rocket.owner)} сдвинулась на 1 клетку.`,
  };
};

export const useGameStore = create((set, get) => ({
  turn: 1,
  phase: 'ACTION',
  activePlayer: 'p1',
  money: { p1: STARTING_MONEY + getIncome(createInitialGrid(), 'p1'), p2: STARTING_MONEY },
  actionPoints: { p1: ACTION_POINTS_PER_TURN, p2: ACTION_POINTS_PER_TURN },
  rocketProgress: { p1: 1, p2: 0 },
  rockets: [],
  winner: null,
  selectedCell: null,
  buildMode: null,
  hiredThisTurn: { p1: 0, p2: 0 },
  log: ['Ход 1: Игрок 1 получил стартовое обслуживание баз для симметрии первого хода.'],
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

    if (selected?.content?.owner === activePlayer) {
      const isTargetRevealed = isConfirmedTarget(clicked, activePlayer);
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
        if (selected.content.type === 'engineer'
          && sourceMode === 'own'
          && clicked.content?.owner === activePlayer
          && clicked.content.kind === 'building') {
          get().engineerRepair(id);
          return;
        }

        if (selected.content.type === 'saboteur'
          && clicked.content?.owner !== activePlayer
          && (clicked.content?.type === 'base' || clicked.content?.type === 'hq')
          && isTargetRevealed) {
          get().saboteurSteal(id);
          return;
        }

        if (clicked.content && clicked.content.owner !== activePlayer && isTargetRevealed) {
          get().attackTarget(id);
          return;
        }

        if (selected.content.type === 'scout' && sourceMode === 'enemy' && !isOwnUnit) {
          get().revealCell(id);
          return;
        }

        if (!clicked.content) {
          if (sourceMode === 'own') get().moveUnit(selectedCell, id);
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

    if (!hasProductionBuilding(grid, activePlayer)) {
      set((state) => ({ log: appendLog(state, 'для найма нужна живая казарма.') }));
      return;
    }

    const cost = UNIT_META[buildMode].cost;
    if (money[activePlayer] < cost) {
      set((state) => ({ log: appendLog(state, `не хватает денег на ${UNIT_META[buildMode].label}: нужно $${cost}.`) }));
      return;
    }

    const targetCell = grid[targetId];
    const hasFriendlyRecruiterNear = grid.some((cell) => cell.content?.owner === activePlayer
      && cell.content.type === 'barracks'
      && !cell.content.damaged
      && areNeighbors(cell.id, targetId));

    if (!hasFriendlyRecruiterNear) {
      set((state) => ({ log: appendLog(state, 'нанимать можно только рядом со своей казармой.') }));
      return;
    }

    if (targetCell.content) {
      set((state) => ({ log: appendLog(state, `на ${idToCoord(targetId)} обнаружено препятствие — найм сорван.`) }));
      return;
    }

    const newGrid = cloneGrid(grid);
    const unit = makeUnit(buildMode, activePlayer);
    newGrid[targetId] = setKnownContent({ ...newGrid[targetId], content: unit }, activePlayer, unit, get().turn);

    const detectedGrid = applySaboteurDetection(newGrid, get().turn);

    set((state) => ({
      grid: detectedGrid,
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
    newGrid[id] = revealTruthFor(newGrid[id], activePlayer, turn);
    newGrid[selectedCell].content.ap = 0;

    const detectedGrid = applySaboteurDetection(newGrid, turn);

    set((state) => ({
      grid: detectedGrid,
      selectedCell: null,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, `Разведчик вскрыл ${idToCoord(id)}.`),
    }));
  },

  moveUnit: (fromId, toId) => {
    const { grid, activePlayer, actionPoints } = get();
    const fromCell = grid[fromId];
    const toCell = grid[toId];

    if (!fromCell.content || fromCell.content.owner !== activePlayer) return;
    if (fromCell.content.kind !== 'unit') return;
    if (fromCell.content.ap <= 0 || actionPoints[activePlayer] <= 0 || (fromCell.content.cooldown ?? 0) > 0) return;
    if (!areNeighbors(fromId, toId) || toCell.content) return;

    const unit = { ...fromCell.content, ap: 0, hasMoved: true };
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

    const detectedGrid = applySaboteurDetection(newGrid, get().turn);

    set((state) => ({
      grid: detectedGrid,
      selectedCell: null,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, `${playerName(activePlayer)} двинул ${UNIT_META[unit.type].label} ${idToCoord(fromId)} → ${idToCoord(toId)}.`),
    }));
  },

  attackTarget: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, turn } = get();
    const attackerCell = selectedCell !== null ? grid[selectedCell] : null;
    const targetCell = grid[targetId];

    if (!attackerCell?.content || attackerCell.content.owner !== activePlayer) return;
    if (attackerCell.content.kind !== 'unit') return;
    if (attackerCell.content.ap <= 0 || actionPoints[activePlayer] <= 0 || (attackerCell.content.cooldown ?? 0) > 0) return;
    if (!areNeighbors(selectedCell, targetId)) return;
    if (!targetCell.content || targetCell.content.owner === activePlayer) return;
    if (!isConfirmedTarget(targetCell, activePlayer)) return;

    const newGrid = cloneGrid(grid);
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
    } else if (targetCell.content.kind === 'building' || targetCell.content.kind === 'rocket') {
      newGrid[targetId] = damageSegment(newGrid[targetId]);
      newGrid[targetId] = revealTruthFor(newGrid[targetId], activePlayer, turn);
      message += newGrid[targetId].content
        ? ` Сегмент ${UNIT_META[targetType].label} повреждён.`
        : ` Сегмент ${UNIT_META[targetType].label} уничтожен.`;
    }

    if (newGrid[selectedCell].content) newGrid[selectedCell].content.ap = 0;

    const newWinner = checkBaseWinCondition(newGrid);

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      winner: newWinner,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, newWinner
        ? `${playerName(newWinner)} побеждает, уничтожив все базы противника!`
        : message),
    }));
  },

  engineerRepair: (buildingId) => {
    const { grid, activePlayer, actionPoints, selectedCell, money, turn } = get();
    const engineerCell = selectedCell !== null ? grid[selectedCell] : null;
    const targetCell = grid[buildingId];

    if (!engineerCell?.content || engineerCell.content.owner !== activePlayer || engineerCell.content.type !== 'engineer') return;
    if (engineerCell.content.ap <= 0 || actionPoints[activePlayer] < 1) return;
    if (!areNeighbors(selectedCell, buildingId)) return;

    const building = targetCell.content;
    if (!building || building.owner !== activePlayer || building.kind !== 'building') return;
    if (!building.damaged) {
      set((state) => ({ log: appendLog(state, `${UNIT_META[building.type].label} на ${idToCoord(buildingId)} не повреждён.`) }));
      return;
    }

    if (building.lastRepaired === turn) {
      set((state) => ({ log: appendLog(state, 'это здание уже чинили в этом ходу.') }));
      return;
    }

    if (money[activePlayer] < ENGINEER_REPAIR_COST) {
      set((state) => ({ log: appendLog(state, `не хватает денег на ремонт: нужно $${ENGINEER_REPAIR_COST}.`) }));
      return;
    }

    const newGrid = cloneGrid(grid);
    newGrid[buildingId] = {
      ...newGrid[buildingId],
      content: { ...newGrid[buildingId].content, damaged: false, lastRepaired: turn },
    };
    newGrid[selectedCell] = {
      ...newGrid[selectedCell],
      content: { ...newGrid[selectedCell].content, ap: 0 },
    };

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      money: { ...state.money, [activePlayer]: state.money[activePlayer] - ENGINEER_REPAIR_COST },
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, `Инженер починил сегмент ${UNIT_META[building.type].label} на ${idToCoord(buildingId)} за $${ENGINEER_REPAIR_COST}.`),
    }));
  },

  saboteurSteal: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, money } = get();
    const saboteurCell = selectedCell !== null ? grid[selectedCell] : null;
    const targetCell = grid[targetId];

    if (!saboteurCell?.content || saboteurCell.content.owner !== activePlayer || saboteurCell.content.type !== 'saboteur') return;
    if (saboteurCell.content.ap <= 0 || actionPoints[activePlayer] < SABOTEUR_ACTION_COST) return;
    if (!areNeighbors(selectedCell, targetId)) return;
    if (!targetCell.content || targetCell.content.owner === activePlayer) return;
    if (targetCell.content.type !== 'base' && targetCell.content.type !== 'hq') return;

    const targetView = targetCell[`${activePlayer}View`];
    if (targetView.state !== 'building' || targetView.type !== targetCell.content.type) return;

    const enemy = getEnemy(activePlayer);
    if (money[enemy] < SABOTEUR_STEAL_AMOUNT) {
      set((state) => ({ log: appendLog(state, 'у врага недостаточно денег для кражи.') }));
      return;
    }

    const newGrid = cloneGrid(grid);
    newGrid[selectedCell] = {
      ...newGrid[selectedCell],
      content: { ...newGrid[selectedCell].content, ap: 0 },
    };

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      money: {
        ...state.money,
        [activePlayer]: state.money[activePlayer] + SABOTEUR_STEAL_AMOUNT,
        [enemy]: state.money[enemy] - SABOTEUR_STEAL_AMOUNT,
      },
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - SABOTEUR_ACTION_COST },
      log: appendLog(state, `Диверсант украл $${SABOTEUR_STEAL_AMOUNT} у ${playerName(enemy)}.`),
    }));
  },

  artilleryFire: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, turn, rockets } = get();
    const artilleryCell = selectedCell !== null ? grid[selectedCell] : null;
    const targetCell = grid[targetId];

    if (!artilleryCell?.content || artilleryCell.content.owner !== activePlayer || artilleryCell.content.type !== 'artillery') return;
    if (artilleryCell.content.ap <= 0 || (artilleryCell.content.cooldown ?? 0) > 0) return;
    if (actionPoints[activePlayer] < ARTILLERY_ACTION_COST) return;
    if (artilleryCell.content.hasMoved) {
      set((state) => ({ log: appendLog(state, 'артиллерия не может стрелять после движения в этот ход.') }));
      return;
    }
    if (!isInRange(selectedCell, targetId, ARTILLERY_RANGE) || selectedCell === targetId) {
      set((state) => ({ log: appendLog(state, `артиллерия бьёт только в радиусе ${ARTILLERY_RANGE} клеток.`) }));
      return;
    }
    if (targetCell.content?.owner === activePlayer) return;
    if (!isConfirmedTarget(targetCell, activePlayer)) {
      set((state) => ({ log: appendLog(state, 'артиллерии нужна разведанная цель: сначала открой клетку разведчиком.') }));
      return;
    }

    const newGrid = cloneGrid(grid);
    let message = `Артиллерия ударила по разведанной цели ${idToCoord(targetId)}.`;

    if (!targetCell.content) {
      newGrid[targetId][`${activePlayer}View`] = { state: 'empty', turnDetected: turn };
      message += ' Цель уже ушла: промах.';
    } else if (targetCell.content.kind === 'unit') {
      message += ` Попадание: уничтожен ${UNIT_META[targetCell.content.type].label}.`;
      newGrid[targetId].content = null;
      newGrid[targetId][`${activePlayer}View`] = { state: 'empty', turnDetected: turn };
    } else if (targetCell.content.kind === 'building' || targetCell.content.kind === 'rocket') {
      const rocketId = targetCell.content.rocketId;
      newGrid[targetId] = damageSegment(newGrid[targetId]);
      newGrid[targetId] = revealTruthFor(newGrid[targetId], activePlayer, turn);
      message += newGrid[targetId].content
        ? ` Сегмент ${UNIT_META[targetCell.content.type].label} повреждён.`
        : ` Сегмент ${UNIT_META[targetCell.content.type].label} уничтожен.`;

      if (rocketId) {
        const rocketCells = getRocketCells(newGrid, rocketId);
        const allRocketCellsDamaged = rocketCells.length > 0 && rocketCells.every((cell) => cell.content?.damaged);
        if (rocketCells.length === 0 || allRocketCellsDamaged) {
          rocketCells.forEach((cell) => {
            newGrid[cell.id] = { ...newGrid[cell.id], content: null };
          });
          message += ' Ядерная ракета сбита.';
        }
      }
    }

    newGrid[selectedCell].content.ap = 0;
    newGrid[selectedCell].content.cooldown = ARTILLERY_COOLDOWN_VALUE;

    const newWinner = checkBaseWinCondition(newGrid);
    const activeRocketIds = new Set(newGrid.filter((cell) => cell.content?.kind === 'rocket').map((cell) => cell.content.rocketId));
    const nextRockets = rockets.filter((rocket) => activeRocketIds.has(rocket.rocketId));

    set((state) => ({
      grid: newGrid,
      rockets: nextRockets,
      selectedCell: null,
      winner: newWinner,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - ARTILLERY_ACTION_COST },
      log: appendLog(state, newWinner
        ? `${playerName(newWinner)} побеждает, уничтожив все базы противника!`
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
      let nextGrid = state.grid.map((cell) => {
        if (cell.content?.owner !== nextPlayer || cell.content.kind !== 'unit') return cell;
        const nextCooldown = Math.max((cell.content.cooldown ?? 0) - 1, 0);
        return {
          ...cell,
          content: {
            ...cell.content,
            cooldown: nextCooldown,
            hasMoved: false,
            ap: nextCooldown > 0 ? 0 : 1,
          },
        };
      });

      const rocketProgress = { ...state.rocketProgress };
      let rockets = [...state.rockets];
      let newWinner = state.winner;
      let rocketMessage = '';

      rockets = rockets.map((rocket) => {
        if (rocket.owner !== nextPlayer || newWinner) return rocket;
        const result = moveRocket(nextGrid, rocket, nextTurnNumber);
        nextGrid = result.grid;
        rocketMessage = result.message;
        if (result.winner) newWinner = result.winner;
        return result.rocket;
      }).filter(Boolean);

      if (!newWinner && !rockets.some((rocket) => rocket.owner === nextPlayer)) {
        const rocketIsCharging = hasActiveRocketSilo(nextGrid, nextPlayer);
        const nextRocketValue = rocketIsCharging
          ? Math.min(rocketProgress[nextPlayer] + 1, ROCKET_LAUNCH_TURNS)
          : rocketProgress[nextPlayer];
        rocketProgress[nextPlayer] = nextRocketValue;

        if (rocketIsCharging && nextRocketValue >= ROCKET_LAUNCH_TURNS) {
          const originId = getRocketOrigin(nextGrid, nextPlayer);
          const newRocket = originId === null ? null : placeRocket(nextGrid, originId, nextPlayer, nextTurnNumber);
          if (newRocket) {
            rockets = [...rockets, newRocket];
            rocketMessage = `Ракетная шахта ${playerName(nextPlayer)} запустила физическую ядерку 2×2.`;
          } else {
            rocketMessage = `Ракетная шахта ${playerName(nextPlayer)} готова, но стартовые клетки ракеты заблокированы.`;
          }
        } else {
          rocketMessage = rocketIsCharging
            ? `Ракетная шахта ${playerName(nextPlayer)} заряжается: ${nextRocketValue}/${ROCKET_LAUNCH_TURNS}.`
            : `у ${playerName(nextPlayer)} нет активной шахты — ядерный прогресс стоит.`;
        }
      }

      return {
        grid: nextGrid,
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
          ? `${rocketMessage} Партия окончена!`
          : `${rocketMessage} Управление переходит к ${playerName(nextPlayer)}.`),
      };
    });

    get().applyIncome(nextPlayer);
  },

  startActionPhase: () => set({ phase: 'ACTION' }),

  applyIncome: (player = get().activePlayer) => {
    const { grid, winner } = get();
    if (winner) return;

    const income = getIncome(grid, player);

    set((state) => ({
      money: { ...state.money, [player]: state.money[player] + income },
      log: income > 0 ? appendLog(state, `${playerName(player)} получил $${income} с баз.`) : state.log,
    }));
  },
}));
