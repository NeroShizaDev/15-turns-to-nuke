import { create } from 'zustand';
import {
  ACTION_POINTS_PER_TURN,
  GRID_SIZE,
  ARTILLERY_ACTION_COST,
  ARTILLERY_RANGE,
  HIREABLE_UNITS,
  MAX_HIRES_PER_TURN,
  ROCKET_LAUNCH_TURNS,
  UNIT_META,
  areNeighbors,
  getEnemy,
  idToCoord,
  isInRange,
  makeCell,
} from '../lib/gameData.js';

const playerName = (player) => (player === 'p1' ? 'Игрок 1' : 'Игрок 2');
const BASE_INCOME = 5;
const HQ_INCOME = 20;
const ENGINEER_REPAIR_COST = 10;
const SABOTEUR_STEAL_AMOUNT = 5;
const STARTING_MONEY = 40;
const ROCKET_FLIGHT_DISTANCE = GRID_SIZE;

const BUILDING_MAX_HP = {
  base: 2,
  hq: 4,
  rocketSilo: 3,
};

const cloneGrid = (grid) => grid.map((cell) => ({
  ...cell,
  content: cell.content ? { ...cell.content } : null,
}));

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
        [enemyViewKey]: { state: 'unit', type: 'saboteur', turnDetected: turn },
      };
    });
  });

  return updatedGrid;
};

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
  hasMoved: false,
  hidden: type === 'saboteur',
});

const normalizeTurn = (turn) => {
  if (typeof turn === 'object') return 1;
  return Number(turn) || 1;
};

const setKnownContent = (cell, player, content, turn = 1) => ({
  ...cell,
  [`${player}View`]: { state: content.kind, type: content.type, turnDetected: normalizeTurn(turn) },
});

const withContent = (grid, id, content) => {
  grid[id] = setKnownContent({ ...grid[id], content }, content.owner, content, 1);
};

const createInitialGrid = () => {
  const grid = Array.from({ length: 100 }, (_, id) => makeCell(id));

  withContent(grid, 81, { type: 'hq', kind: 'building', owner: 'p1', hp: 4 });
  withContent(grid, 91, { type: 'base', kind: 'building', owner: 'p1', hp: 2 });
  withContent(grid, 90, { type: 'rocketSilo', kind: 'building', owner: 'p1', hp: 3 });
  withContent(grid, 72, makeUnit('infantry', 'p1'));
  withContent(grid, 62, makeUnit('scout', 'p1'));
  withContent(grid, 83, makeUnit('engineer', 'p1'));
  withContent(grid, 73, makeUnit('artillery', 'p1'));
  withContent(grid, 84, makeUnit('saboteur', 'p1'));

  withContent(grid, 18, { type: 'hq', kind: 'building', owner: 'p2', hp: 4 });
  withContent(grid, 8, { type: 'base', kind: 'building', owner: 'p2', hp: 2 });
  withContent(grid, 9, { type: 'rocketSilo', kind: 'building', owner: 'p2', hp: 3 });
  withContent(grid, 27, makeUnit('infantry', 'p2'));
  withContent(grid, 37, makeUnit('scout', 'p2'));
  withContent(grid, 17, makeUnit('engineer', 'p2'));
  withContent(grid, 26, makeUnit('artillery', 'p2'));
  withContent(grid, 16, makeUnit('saboteur', 'p2'));


  return grid;
};

const revealTruthFor = (cell, player, turn) => {
  if (!cell.content) return { ...cell, [`${player}View`]: { state: 'empty', turnDetected: turn } };
  return setKnownContent(cell, player, cell.content, turn);
};

const damageOrDestroyBuilding = (cell) => {
  const nextHp = (cell.content.hp ?? 1) - 1;
  if (nextHp <= 0) {
    return { ...cell, content: null };
  }
  return { ...cell, content: { ...cell.content, hp: nextHp } };
};

const hasActiveRocketSilo = (grid, player) => grid.some(
  (cell) => cell.content?.owner === player && cell.content.type === 'rocketSilo',
);

const canHireFrom = (cell, player) => cell.content?.owner === player
  && (cell.content.type === 'base' || cell.content.type === 'hq');

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
  return viewState === 'unit' || viewState === 'building';
};

export const useGameStore = create((set, get) => ({
  turn: 1,
  phase: 'ACTION',
  activePlayer: 'p1',
  money: { p1: STARTING_MONEY + BASE_INCOME + HQ_INCOME, p2: STARTING_MONEY },
  actionPoints: { p1: ACTION_POINTS_PER_TURN, p2: ACTION_POINTS_PER_TURN },
  rocketProgress: { p1: 1, p2: 0 },
  rocketFlight: { p1: null, p2: null },
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

    const cost = UNIT_META[buildMode].cost;
    if (money[activePlayer] < cost) {
      set((state) => ({ log: appendLog(state, `не хватает денег на ${UNIT_META[buildMode].label}: нужно $${cost}.`) }));
      return;
    }

    const targetCell = grid[targetId];
    const hasFriendlyRecruiterNear = grid.some((cell) => canHireFrom(cell, activePlayer) && areNeighbors(cell.id, targetId));

    if (!hasFriendlyRecruiterNear) {
      set((state) => ({ log: appendLog(state, 'нанимать можно только рядом со своей базой или HQ.') }));
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
    if (attackerCell.content.ap <= 0 || actionPoints[activePlayer] <= 0 || (attackerCell.content.cooldown ?? 0) > 0) return;
    if (!areNeighbors(selectedCell, targetId)) return;
    if (!targetCell.content || targetCell.content.owner === activePlayer) return;

    const targetViewState = targetCell[`${activePlayer}View`].state;
    if (targetViewState !== 'unit' && targetViewState !== 'building') return;

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
    } else {
      const damaged = damageOrDestroyBuilding(newGrid[targetId]);
      newGrid[targetId] = revealTruthFor(damaged, activePlayer, turn);
      message += damaged.content ? ` Прочность: ${damaged.content.hp}.` : ' Здание разрушено.';
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

    const maxHp = BUILDING_MAX_HP[building.type] ?? 1;
    if ((building.hp ?? maxHp) >= maxHp) {
      set((state) => ({ log: appendLog(state, `${UNIT_META[building.type].label} уже полностью исправно.`) }));
      return;
    }

    if (building.lastRepaired === turn) {
      set((state) => ({ log: appendLog(state, 'Это здание уже чинили в этом ходу.') }));
      return;
    }

    if (money[activePlayer] < ENGINEER_REPAIR_COST) {
      set((state) => ({ log: appendLog(state, `не хватает денег на ремонт: нужно $${ENGINEER_REPAIR_COST}.`) }));
      return;
    }

    const newGrid = cloneGrid(grid);
    newGrid[buildingId] = {
      ...newGrid[buildingId],
      content: { ...newGrid[buildingId].content, hp: (building.hp ?? maxHp) + 1, lastRepaired: turn },
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
      log: appendLog(state, `Инженер починил ${UNIT_META[building.type].label} на ${idToCoord(buildingId)} за $${ENGINEER_REPAIR_COST} (HP: ${(building.hp ?? maxHp) + 1}/${maxHp}).`),
    }));
  },

  saboteurSteal: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, money } = get();
    const saboteurCell = selectedCell !== null ? grid[selectedCell] : null;
    const targetCell = grid[targetId];

    if (!saboteurCell?.content || saboteurCell.content.owner !== activePlayer || saboteurCell.content.type !== 'saboteur') return;
    if (saboteurCell.content.ap <= 0 || actionPoints[activePlayer] < 1) return;
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
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, `Диверсант украл $${SABOTEUR_STEAL_AMOUNT} у ${playerName(enemy)}.`),
    }));
  },

  artilleryFire: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, turn } = get();
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
    } else {
      const damaged = damageOrDestroyBuilding(newGrid[targetId]);
      newGrid[targetId] = revealTruthFor(damaged, activePlayer, turn);
      message += damaged.content
        ? ` Попадание по зданию ${UNIT_META[targetCell.content.type].label}, прочность ${damaged.content.hp}.`
        : ` Попадание: ${UNIT_META[targetCell.content.type].label} разрушена.`;
    }

    newGrid[selectedCell].content.ap = 0;
    newGrid[selectedCell].content.cooldown = 2;

    const newWinner = checkBaseWinCondition(newGrid);

    set((state) => ({
      grid: newGrid,
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
      const resetGrid = state.grid.map((cell) => {
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
      const rocketFlight = { ...state.rocketFlight };
      let newWinner = state.winner;
      let rocketMessage = '';

      if (rocketFlight[nextPlayer]) {
        const distanceRemaining = rocketFlight[nextPlayer].distanceRemaining - 1;
        rocketFlight[nextPlayer] = { ...rocketFlight[nextPlayer], distanceRemaining };
        rocketMessage = `Ракета ${playerName(nextPlayer)} летит к краю карты: осталось ${Math.max(distanceRemaining, 0)} клеток.`;

        if (distanceRemaining <= 0) {
          newWinner = nextPlayer;
          rocketMessage = `${playerName(nextPlayer)} довёл ядерную ракету до края карты противника.`;
        }
      } else {
        const rocketIsCharging = hasActiveRocketSilo(resetGrid, nextPlayer);
        const nextRocketValue = rocketIsCharging
          ? Math.min(rocketProgress[nextPlayer] + 1, ROCKET_LAUNCH_TURNS)
          : rocketProgress[nextPlayer];
        rocketProgress[nextPlayer] = nextRocketValue;

        if (rocketIsCharging && nextRocketValue >= ROCKET_LAUNCH_TURNS) {
          rocketFlight[nextPlayer] = { distanceRemaining: ROCKET_FLIGHT_DISTANCE, launchedTurn: nextTurnNumber };
          rocketMessage = `Ракетная шахта ${playerName(nextPlayer)} запустила ядерку: до края ${ROCKET_FLIGHT_DISTANCE} клеток.`;
        } else {
          rocketMessage = rocketIsCharging
            ? `Ракетная шахта ${playerName(nextPlayer)} заряжается: ${nextRocketValue}/${ROCKET_LAUNCH_TURNS}.`
            : `у ${playerName(nextPlayer)} нет активной шахты — ядерный таймер стоит.`;
        }
      }

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
        rocketFlight,
        winner: newWinner,
        log: appendLog({ ...state, turn: nextTurnNumber }, newWinner
          ? `${rocketMessage} Партия окончена!`
          : `${rocketMessage} Управление переходит к ${playerName(nextPlayer)}.`),
      };
    });

    get().applyIncome(nextPlayer);
  },


  startActionPhase: () => set((state) => ({ phase: state.winner ? 'ACTION' : 'ACTION' })),

  applyIncome: (player = get().activePlayer) => {
    const { grid, winner } = get();
    if (winner) return;

    const income = grid.reduce((acc, cell) => {
      if (cell.content?.owner !== player) return acc;
      if (cell.content.type === 'base') return acc + BASE_INCOME;
      if (cell.content.type === 'hq') return acc + HQ_INCOME;
      return acc;
    }, 0);

    set((state) => ({
      money: { ...state.money, [player]: state.money[player] + income },
      log: income > 0 ? appendLog(state, `${playerName(player)} получил $${income} с баз.`) : state.log,
    }));
  },
}));
