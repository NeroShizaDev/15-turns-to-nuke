import { create } from 'zustand';
import {
  ACTION_POINTS_PER_TURN,
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

const cloneGrid = (grid) => grid.map((cell) => ({
  ...cell,
  content: cell.content ? { ...cell.content } : null,
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

const withContent = (grid, id, content) => {
  grid[id] = setKnownContent({ ...grid[id], content }, content.owner, content);
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

  withContent(grid, 18, { type: 'hq', kind: 'building', owner: 'p2', hp: 4 });
  withContent(grid, 8, { type: 'base', kind: 'building', owner: 'p2', hp: 2 });
  withContent(grid, 9, { type: 'rocketSilo', kind: 'building', owner: 'p2', hp: 3 });
  withContent(grid, 27, makeUnit('infantry', 'p2'));
  withContent(grid, 37, makeUnit('scout', 'p2'));
  withContent(grid, 26, makeUnit('artillery', 'p2'));
  withContent(grid, 16, makeUnit('saboteur', 'p2'));

  grid[27].p1View = { state: 'ghost', lastType: 'infantry', lastTurn: 1 };
  grid[16].p1View = { state: 'unknown' };
  grid[72].p2View = { state: 'ghost', lastType: 'infantry', lastTurn: 1 };

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

export const useGameStore = create((set, get) => ({
  turn: 1,
  phase: 'ACTION',
  activePlayer: 'p1',
  money: { p1: 40, p2: 40 },
  actionPoints: { p1: ACTION_POINTS_PER_TURN, p2: ACTION_POINTS_PER_TURN },
  rocketProgress: { p1: 0, p2: 0 },
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

    if (selected?.content?.owner === activePlayer) {
      if (clicked.content?.owner === activePlayer && clicked.content.kind === 'unit') {
        set({ selectedCell: id, buildMode: null });
        return;
      }

      if (selected.content.type === 'artillery' && sourceMode === 'enemy') {
        get().artilleryFire(id);
        return;
      }

      if (areNeighbors(selectedCell, id)) {
        if (clicked.content && clicked.content.owner !== activePlayer) {
          get().attackTarget(id);
          return;
        }

        if (!clicked.content && selected.content.type === 'scout' && sourceMode === 'enemy') {
          get().revealCell(id);
          return;
        }

        if (!clicked.content) {
          get().moveUnit(selectedCell, id);
          return;
        }
      }
    }

    if (clicked.content?.owner === activePlayer
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
    newGrid[id] = revealTruthFor(newGrid[id], activePlayer, turn);
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

    if (!fromCell.content || fromCell.content.owner !== activePlayer) return;
    if (fromCell.content.ap <= 0 || actionPoints[activePlayer] <= 0 || (fromCell.content.cooldown ?? 0) > 0) return;
    if (!areNeighbors(fromId, toId) || toCell.content) return;

    const unit = { ...fromCell.content, ap: 0 };
    const enemy = getEnemy(activePlayer);
    const enemyView = `${enemy}View`;
    const ownerView = `${activePlayer}View`;
    const newGrid = cloneGrid(grid);

    newGrid[fromId] = {
      ...newGrid[fromId],
      content: null,
      [enemyView]: { state: 'ghost', lastType: unit.type, lastTurn: get().turn },
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

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - 1 },
      log: appendLog(state, message),
    }));
  },

  artilleryFire: (targetId) => {
    const { grid, activePlayer, actionPoints, selectedCell, turn } = get();
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

    const newGrid = cloneGrid(grid);
    let message = `Артиллерия дала слепой залп по ${idToCoord(targetId)}.`;

    if (!targetCell.content) {
      newGrid[targetId][`${activePlayer}View`] = { state: 'empty', turnDetected: turn };
      message += ' Промах: клетка была пустой.';
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
    newGrid[selectedCell].content.cooldown = 1;

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      actionPoints: { ...state.actionPoints, [activePlayer]: state.actionPoints[activePlayer] - ARTILLERY_ACTION_COST },
      log: appendLog(state, message),
    }));
  },

  nextTurn: () => {
    const { activePlayer, winner } = get();
    if (winner) return;

    const nextPlayer = getEnemy(activePlayer);
    const shouldAdvanceTurn = activePlayer === 'p2';

    set((state) => {
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

      const rocketIsCharging = hasActiveRocketSilo(resetGrid, nextPlayer);
      const nextRocketValue = rocketIsCharging
        ? Math.min(state.rocketProgress[nextPlayer] + 1, ROCKET_LAUNCH_TURNS)
        : state.rocketProgress[nextPlayer];
      const rocketProgress = { ...state.rocketProgress, [nextPlayer]: nextRocketValue };
      const newWinner = nextRocketValue >= ROCKET_LAUNCH_TURNS ? nextPlayer : state.winner;
      const rocketMessage = rocketIsCharging
        ? `Ракетная шахта ${playerName(nextPlayer)} заряжается: ${nextRocketValue}/${ROCKET_LAUNCH_TURNS}.`
        : `у ${playerName(nextPlayer)} нет активной шахты — ядерный таймер стоит.`;

      return {
        grid: resetGrid,
        turn: shouldAdvanceTurn ? state.turn + 1 : state.turn,
        activePlayer: nextPlayer,
        selectedCell: null,
        buildMode: null,
        phase: 'TRANSITION',
        actionPoints: { ...state.actionPoints, [nextPlayer]: ACTION_POINTS_PER_TURN },
        hiredThisTurn: { ...state.hiredThisTurn, [nextPlayer]: 0 },
        rocketProgress,
        winner: newWinner,
        log: appendLog({ ...state, turn: shouldAdvanceTurn ? state.turn + 1 : state.turn }, newWinner
          ? `${playerName(nextPlayer)} запускает ядерку. Партия окончена!`
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
      if (cell.content.type === 'base') return acc + 5;
      if (cell.content.type === 'hq') return acc + 15;
      return acc;
    }, 0);

    set((state) => ({
      money: { ...state.money, [player]: state.money[player] + income },
      log: income > 0 ? appendLog(state, `${playerName(player)} получил $${income} с баз.`) : state.log,
    }));
  },
}));
