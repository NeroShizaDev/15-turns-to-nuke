import { areNeighbors } from '../lib/gameData.js';
import Cell from './Cell.jsx';

const getDisplay = (cell, activePlayer, mode) => {
  const ownContent = cell.content?.owner === activePlayer ? cell.content : null;

  if (mode === 'own') {
    return ownContent
      ? { state: 'own', content: ownContent }
      : { state: 'empty', content: null };
  }

  const view = cell[`${activePlayer}View`];

  if (ownContent) return { state: 'own', content: ownContent };
  if (view.state === 'unit' || view.state === 'building') {
    return { state: 'enemy', content: { type: view.type }, turnDetected: view.turnDetected };
  }
  if (view.state === 'ghost') {
    return { state: 'ghost', content: view.lastType, turnDetected: view.lastTurn };
  }
  if (view.state === 'empty') {
    return { state: 'empty', content: null, turnDetected: view.turnDetected };
  }

  return { state: 'unknown', content: null };
};

export default function GameGrid({ title, mode, grid, activePlayer, selectedCell, onCellClick }) {
  return (
    <section>
      <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-[0.35em] text-blue-950">
        {title}
      </h3>
      <div className={`grid grid-cols-10 overflow-hidden border-2 ${mode === 'enemy' ? 'border-red-300' : 'border-blue-400'} bg-white/75 shadow-inner`}>
        {grid.map((cell) => {
          const selected = selectedCell === cell.id;
          const movable = mode === 'own' && selectedCell !== null && areNeighbors(selectedCell, cell.id) && !cell.content;

          return (
            <Cell
              key={`${mode}-${cell.id}`}
              cell={cell}
              display={getDisplay(cell, activePlayer, mode)}
              selected={selected}
              movable={movable}
              onClick={onCellClick}
            />
          );
        })}
      </div>
    </section>
  );
}
