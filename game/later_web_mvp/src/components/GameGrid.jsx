import { ARTILLERY_RANGE, BUILDINGS, areNeighbors, isInRange } from '../lib/gameData.js';
import { getRocketContent } from '../store/useGameStore.js';
import Cell from './Cell.jsx';

const getDisplay = (cell, activePlayer, mode, rockets) => {
  const rocketContent = getRocketContent(rockets, cell.id);
  if (rocketContent) {
    return {
      state: rocketContent.owner === activePlayer ? 'own' : 'enemy',
      content: rocketContent,
    };
  }

  const ownContent = cell.content?.owner === activePlayer ? cell.content : null;

  if (mode === 'own') {
    return ownContent
      ? { state: 'own', content: ownContent }
      : { state: 'empty', content: null };
  }

  const view = cell[`${activePlayer}View`];

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

const canRecruitFrom = (cell, activePlayer, unitType) => {
  const building = cell.content;

  return building?.kind === 'building'
    && building.owner === activePlayer
    && !building.damaged
    && Boolean(BUILDINGS[building.type]?.hireUnits.includes(unitType));
};

const canActOnCell = ({ mode, cell, grid, activePlayer, selectedCell, buildMode }) => {
  if (buildMode) {
    if (mode !== 'own') return false;
    const hasRecruiterNear = grid.some((candidate) => canRecruitFrom(candidate, activePlayer, buildMode)
      && areNeighbors(candidate.id, cell.id));
    return !cell.content && hasRecruiterNear;
  }

  if (selectedCell === null) return false;

  const selectedContent = grid[selectedCell]?.content;
  if (!selectedContent) return false;

  if (selectedContent.type === 'artillery') {
    const isOwnUnit = cell.content?.owner === activePlayer;
    return mode === 'enemy'
      && selectedCell !== cell.id
      && !isOwnUnit
      && isInRange(selectedCell, cell.id, ARTILLERY_RANGE);
  }

  return mode === 'own' && areNeighbors(selectedCell, cell.id) && !cell.content;
};

export default function GameGrid({
  title,
  mode,
  grid,
  rockets = [],
  activePlayer,
  selectedCell,
  buildMode,
  onCellClick,
}) {
  const physicalRockets = rockets.filter((rocket) => rocket.status !== 'destroyed' && rocket.status !== 'escaped');

  return (
    <section>
      <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-[0.35em] text-blue-950">
        {title}
      </h3>
      {physicalRockets.length > 0 && (
        <div className="mb-2 space-y-1 text-[0.65rem] uppercase text-red-700">
          {physicalRockets.map((rocket) => (
            <p key={rocket.rocketId}>
              {rocket.rocketId}: {rocket.direction} @ {rocket.cells.join(', ')}
            </p>
          ))}
        </div>
      )}
      <div className={`grid grid-cols-10 overflow-hidden border-2 ${mode === 'enemy' ? 'border-red-300' : 'border-blue-400'} bg-white/75 shadow-inner`}>
        {grid.map((cell) => {
          const selected = selectedCell === cell.id;
          const actionable = canActOnCell({ mode, cell, grid, activePlayer, selectedCell, buildMode });

          return (
            <Cell
              key={`${mode}-${cell.id}`}
              cell={cell}
              display={getDisplay(cell, activePlayer, mode, rockets)}
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
