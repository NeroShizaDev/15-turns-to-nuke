import { ARTILLERY_RANGE, areNeighbors, isInRange } from '../lib/gameData.js';
import Cell from './Cell.jsx';

const getDisplay = (cell, activePlayer, mode) => {
  const ownContent = cell.content?.owner === activePlayer ? cell.content : null;

  if (mode === 'own') {
    return ownContent
      ? { state: 'own', content: ownContent }
      : { state: 'empty', content: null };
  }

  const view = cell[`${activePlayer}View`];

  if (ownContent) return { state: 'empty', content: null };

  if (view.state === 'unit' || view.state === 'building' || view.state === 'rocket') {
    return { state: 'enemy', content: { type: view.type, damaged: view.damaged }, turnDetected: view.turnDetected };
  }
  if (view.state === 'ghost') {
    return { state: 'ghost', content: view.lastType, turnDetected: view.lastTurn };
  }
  if (view.state === 'empty') {
    return { state: 'empty', content: null, turnDetected: view.turnDetected };
  }

  return { state: 'unknown', content: null };
};

const canActOnCell = ({ mode, cell, grid, activePlayer, selectedCell, buildMode }) => {
  if (buildMode) {
    if (mode !== 'own') return false;

    const display = getDisplay(cell, activePlayer, mode);
    const isApparentlyEmpty = display.state === 'empty';
    const hasRecruiterNear = grid.some((candidate) => candidate.content
      && candidate.content.owner === activePlayer
      && candidate.content.type === 'barracks'
      && !candidate.content.damaged
      && areNeighbors(candidate.id, cell.id));

    return isApparentlyEmpty && hasRecruiterNear;
  }

  if (selectedCell === null) return false;

  const selectedContent = grid[selectedCell]?.content;
  if (!selectedContent) return false;

  if (selectedContent.type === 'artillery') {
    const view = cell[`${activePlayer}View`];
    const isOwnUnit = cell.content?.owner === activePlayer;
    const isConfirmedTarget = view.state === 'unit' || view.state === 'building' || view.state === 'rocket';
    return mode === 'enemy'
      && selectedCell !== cell.id
      && !isOwnUnit
      && isConfirmedTarget
      && isInRange(selectedCell, cell.id, ARTILLERY_RANGE);
  }

  if (selectedContent.type === 'engineer') {
    return mode === 'own'
      && areNeighbors(selectedCell, cell.id)
      && cell.content?.owner === activePlayer
      && cell.content.kind === 'building'
      && cell.content.damaged;
  }

  if (selectedContent.type === 'saboteur') {
    const view = cell[`${activePlayer}View`];
    return mode === 'enemy'
      && areNeighbors(selectedCell, cell.id)
      && (view.state === 'building')
      && (view.type === 'base' || view.type === 'hq')
      && cell.content?.owner !== activePlayer;
  }

  return mode === 'own' && areNeighbors(selectedCell, cell.id) && !cell.content;
};

export default function GameGrid({ title, mode, grid, activePlayer, selectedCell, buildMode, onCellClick }) {
  return (
    <section>
      <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-[0.35em] text-blue-950">
        {title}
      </h3>
      <div className={`grid grid-cols-10 overflow-hidden border-2 ${mode === 'enemy' ? 'border-red-300' : 'border-blue-400'} bg-white/75 shadow-inner`}>
        {grid.map((cell) => {
          const selected = selectedCell === cell.id;
          const actionable = canActOnCell({ mode, cell, grid, activePlayer, selectedCell, buildMode });

          return (
            <Cell
              key={`${mode}-${cell.id}`}
              cell={cell}
              display={getDisplay(cell, activePlayer, mode)}
              selected={selected}
              actionable={actionable}
              onClick={(id) => onCellClick(id, mode)}
              activePlayer={activePlayer}
            />
          );
        })}
      </div>
    </section>
  );
}
