import { create } from 'zustand';
import { AI_TURN_DELAY_MS, BUILDINGS, areNeighbors } from '../lib/gameData.js';
import { runAiTurn } from '../lib/ai.js';
import {
  attack,
  build,
  createInitialState,
  dismantle,
  endTurn,
  harvest,
  isRepairableRuin,
  move,
  produce,
  repair,
  sabotage,
  scout,
  unload,
} from '../lib/rules.js';

const UI_RESET = {
  selectedCell: null,
  structureMode: null,
  engineerMode: null,
  notice: null,
};

// В режиме ИИ экран всегда показан глазами игрока 1, в hotseat — глазами активного игрока.
export const getViewer = (state) => (state.mode === 'ai' ? 'p1' : state.activePlayer);

// Чем выбранный юнит действует по карте противника.
const ENEMY_MAP_ACTIONS = { infantry: attack, artillery: attack, scout, saboteur: sabotage };

export const useGameStore = create((set, get) => {
  const apply = (result, uiAfterSuccess = {}) => {
    if (result.ok) {
      set({ ...result.state, notice: null, ...uiAfterSuccess });
    } else {
      set({ notice: result.message });
    }
    return result.ok;
  };

  const canAct = () => {
    const state = get();
    return state.phase === 'ACTION' && !state.winner;
  };

  return {
    ...createInitialState('ai'),
    phase: 'ACTION',
    aiToken: 0,
    ...UI_RESET,

    newGame: (mode = get().mode) => set((state) => ({
      ...createInitialState(mode),
      phase: 'ACTION',
      aiToken: state.aiToken + 1,
      ...UI_RESET,
    })),

    clearSelection: () => set(UI_RESET),

    // Выбор постройки из меню: строит выбранный инженер или выбранная Главная база.
    setStructureMode: (type) => {
      const { selectedCell, structureMode } = get();
      if (!BUILDINGS[type] || selectedCell === null) return;
      const same = structureMode?.type === type;
      set({ structureMode: same ? null : { type, builderId: selectedCell }, engineerMode: null, notice: null });
    },

    setEngineerMode: (mode) => set((state) => ({
      engineerMode: state.engineerMode === mode ? null : mode,
      structureMode: null,
      notice: null,
    })),

    // Заказ юнита в выбранном здании: выходит сам на свободную соседнюю клетку.
    produceUnit: (type) => {
      if (!canAct()) return;
      const state = get();
      if (state.selectedCell === null) return;
      apply(produce(state, state.activePlayer, state.selectedCell, type));
    },

    // Клик по своей карте: выбор юнита/здания, ход, стройка, сбор, ремонт, разборка.
    clickOwnCell: (id) => {
      if (!canAct()) return;
      const state = get();
      const player = state.activePlayer;
      const board = state.boards[player];
      const cell = board[id];

      if (state.structureMode) {
        const { type, builderId } = state.structureMode;
        apply(build(state, player, type, id, builderId), { structureMode: null, selectedCell: null });
        return;
      }
      if (state.engineerMode === 'dismantle') {
        apply(dismantle(state, player, state.selectedCell, id), { engineerMode: null, selectedCell: null });
        return;
      }

      const selected = state.selectedCell !== null ? board[state.selectedCell].content : null;

      if (selected?.kind === 'unit' && areNeighbors(state.selectedCell, id)) {
        const from = state.selectedCell;
        if (selected.type === 'harvester' && cell.content?.kind === 'ruin') {
          apply(harvest(state, player, from, id), { selectedCell: null });
          return;
        }
        if (selected.type === 'harvester' && cell.content?.kind === 'building' && BUILDINGS[cell.content.type].receivesCargo) {
          apply(unload(state, player, from), { selectedCell: null });
          return;
        }
        if (selected.type === 'engineer' && isRepairableRuin(board, cell)) {
          apply(repair(state, player, from, id), { selectedCell: null });
          return;
        }
        if (!cell.content) {
          apply(move(state, player, from, id), { selectedCell: null });
          return;
        }
      }

      // Клик по своему юниту или зданию выбирает его; по зданию — открывает его меню.
      const selectable = cell.content?.kind === 'unit' || cell.content?.kind === 'building';
      const sameBuilding = selected?.kind === 'building' && cell.content?.buildingId === selected.buildingId;
      const reselect = state.selectedCell === id || sameBuilding;
      set({ ...UI_RESET, selectedCell: selectable && !reselect ? id : null });
    },

    // Клик по карте противника: выстрел, разведка или диверсия выбранным юнитом.
    clickEnemyCell: (id) => {
      if (!canAct()) return;
      const state = get();
      const player = state.activePlayer;
      const selected = state.selectedCell !== null ? state.boards[player][state.selectedCell].content : null;
      const action = selected?.kind === 'unit' ? ENEMY_MAP_ACTIONS[selected.type] : null;

      if (!action) {
        set({ notice: 'выбери на своей карте пехоту, артиллерию, разведчика или диверсанта — и бей по полю противника.' });
        return;
      }
      apply(action(state, player, state.selectedCell, id), { selectedCell: null });
    },

    nextTurn: () => {
      if (!canAct()) return;
      const state = get();
      const next = endTurn(state);

      if (state.mode !== 'ai') {
        set({ ...next, ...UI_RESET, phase: next.winner ? 'ACTION' : 'TRANSITION' });
        return;
      }

      // Ход ИИ: короткая пауза «думает», затем все его действия разом.
      const token = state.aiToken + 1;
      set({ ...next, ...UI_RESET, phase: next.winner ? 'ACTION' : 'AI', aiToken: token });
      if (next.winner) return;

      setTimeout(() => {
        const current = get();
        if (current.phase !== 'AI' || current.aiToken !== token) return;
        let after = runAiTurn(current, 'p2');
        if (!after.winner) after = endTurn(after);
        set({ ...after, phase: 'ACTION' });
      }, AI_TURN_DELAY_MS);
    },

    startActionPhase: () => set({ phase: 'ACTION' }),
  };
});

export default useGameStore;
