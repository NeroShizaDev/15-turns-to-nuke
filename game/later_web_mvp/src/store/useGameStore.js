import { create } from 'zustand';
import {
  ACTION_POINTS_PER_TURN,
  areNeighbors,
  getEnemy,
  idToCoord,
  makeCell,
} from '../lib/gameData.js';

const withContent = (grid, id, content) => {
  const viewKey = `${content.owner}View`;
  grid[id] = {
    ...grid[id],
    content,
    [viewKey]: { state: content.kind, type: content.type, turnDetected: 1 },
  };
};

const createInitialGrid = () => {
  const grid = Array.from({ length: 100 }, (_, id) => makeCell(id));

  withContent(grid, 81, { type: 'hq', kind: 'building', owner: 'p1', hp: 4 });
  withContent(grid, 91, { type: 'base', kind: 'building', owner: 'p1', hp: 1 });
  withContent(grid, 72, { type: 'infantry', kind: 'unit', owner: 'p1', ap: 1 });
  withContent(grid, 62, { type: 'scout', kind: 'unit', owner: 'p1', ap: 1 });
  withContent(grid, 83, { type: 'engineer', kind: 'unit', owner: 'p1', ap: 1 });

  withContent(grid, 18, { type: 'hq', kind: 'building', owner: 'p2', hp: 4 });
  withContent(grid, 8, { type: 'base', kind: 'building', owner: 'p2', hp: 1 });
  withContent(grid, 27, { type: 'infantry', kind: 'unit', owner: 'p2', ap: 1 });
  withContent(grid, 37, { type: 'scout', kind: 'unit', owner: 'p2', ap: 1 });
  withContent(grid, 16, { type: 'saboteur', kind: 'unit', owner: 'p2', ap: 1, hidden: true });

  grid[27].p1View = { state: 'ghost', lastType: 'infantry', lastTurn: 1 };
  grid[16].p1View = { state: 'unknown' };
  grid[72].p2View = { state: 'ghost', lastType: 'infantry', lastTurn: 1 };

  return grid;
};

const appendLog = (state, message) => [
  `Ход ${state.turn}: ${message}`,
  ...state.log,
].slice(0, 8);

export const useGameStore = create((set, get) => ({
  turn: 1,
  phase: 'ACTION',
  activePlayer: 'p1',
  money: { p1: 40, p2: 40 },
  actionPoints: { p1: ACTION_POINTS_PER_TURN, p2: ACTION_POINTS_PER_TURN },
  selectedCell: null,
  log: ['Ход 1: партия началась, туман войны активен.'],
  grid: createInitialGrid(),

  selectCell: (id) => {
    const { grid, selectedCell, activePlayer, actionPoints } = get();
    const clicked = grid[id];
    const selected = selectedCell !== null ? grid[selectedCell] : null;

    if (selected?.content?.owner === activePlayer && areNeighbors(selectedCell, id)) {
      get().moveUnit(selectedCell, id);
      return;
    }

    if (clicked.content?.owner === activePlayer && clicked.content.kind === 'unit' && actionPoints[activePlayer] > 0) {
      set({ selectedCell: id });
      return;
    }

    set({ selectedCell: null });
  },

  clearSelection: () => set({ selectedCell: null }),

  revealCell: (id) => {
    const { activePlayer, grid } = get();
    const viewKey = `${activePlayer}View`;
    const cell = grid[id];
    const newGrid = [...grid];
    const revealed = cell.content
      ? { state: cell.content.kind, type: cell.content.type, turnDetected: get().turn }
      : { state: 'empty', turnDetected: get().turn };

    newGrid[id] = { ...cell, [viewKey]: revealed };
    set((state) => ({
      grid: newGrid,
      log: appendLog(state, `${state.activePlayer === 'p1' ? 'Игрок 1' : 'Игрок 2'} разведал ${idToCoord(id)}.`),
    }));
  },

  moveUnit: (fromId, toId) => {
    const { grid, activePlayer, actionPoints } = get();
    const fromCell = grid[fromId];
    const toCell = grid[toId];

    if (!fromCell.content || fromCell.content.owner !== activePlayer) return;
    if (fromCell.content.ap <= 0 || actionPoints[activePlayer] <= 0) return;
    if (!areNeighbors(fromId, toId) || toCell.content) return;

    const unit = { ...fromCell.content, ap: 0 };
    const enemy = getEnemy(activePlayer);
    const enemyView = `${enemy}View`;
    const ownerView = `${activePlayer}View`;
    const newGrid = [...grid];

    newGrid[fromId] = {
      ...fromCell,
      content: null,
      [enemyView]: {
        state: 'ghost',
        lastType: unit.type,
        lastTurn: get().turn,
      },
      [ownerView]: { state: 'empty', turnDetected: get().turn },
    };

    newGrid[toId] = {
      ...toCell,
      content: unit,
      [ownerView]: { state: 'unit', type: unit.type, turnDetected: get().turn },
    };

    set((state) => ({
      grid: newGrid,
      selectedCell: null,
      actionPoints: {
        ...state.actionPoints,
        [activePlayer]: state.actionPoints[activePlayer] - 1,
      },
      log: appendLog(state, `${activePlayer === 'p1' ? 'Игрок 1' : 'Игрок 2'} двинул ${unit.type} ${idToCoord(fromId)} → ${idToCoord(toId)}.`),
    }));
  },

  nextTurn: () => {
    const { activePlayer } = get();
    const nextPlayer = getEnemy(activePlayer);
    const shouldAdvanceTurn = activePlayer === 'p2';

    set((state) => {
      const resetGrid = state.grid.map((cell) => {
        if (cell.content?.owner !== nextPlayer || cell.content.kind !== 'unit') return cell;
        return { ...cell, content: { ...cell.content, ap: 1 } };
      });

      return {
        grid: resetGrid,
        turn: shouldAdvanceTurn ? state.turn + 1 : state.turn,
        activePlayer: nextPlayer,
        selectedCell: null,
        phase: 'TRANSITION',
        actionPoints: {
          ...state.actionPoints,
          [nextPlayer]: ACTION_POINTS_PER_TURN,
        },
        log: appendLog(state, `управление переходит к ${nextPlayer === 'p1' ? 'Игроку 1' : 'Игроку 2'}.`),
      };
    });

    get().applyIncome(nextPlayer);
  },

  startActionPhase: () => set({ phase: 'ACTION' }),

  applyIncome: (player = get().activePlayer) => {
    const { grid } = get();
    const income = grid.reduce((acc, cell) => {
      if (cell.content?.owner !== player) return acc;
      if (cell.content.type === 'base') return acc + 5;
      if (cell.content.type === 'hq') return acc + 15;
      return acc;
    }, 0);

    set((state) => ({
      money: { ...state.money, [player]: state.money[player] + income },
      log: income > 0 ? appendLog(state, `${player === 'p1' ? 'Игрок 1' : 'Игрок 2'} получил $${income} с баз.`) : state.log,
    }));
  },
}));
