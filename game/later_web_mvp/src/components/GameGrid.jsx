import Cell from './Cell.jsx';
import { describeRocketStatus, getRocketContent } from '../store/useGameStore.js';

export default function GameGrid({ grid, rockets = [], onCellClick }) {
  const physicalRockets = rockets.filter((rocket) => rocket.status !== 'destroyed');

  return (
    <section className="game-grid-panel">
      <div className="rocket-status-list" aria-label="Physical rocket status">
        {physicalRockets.length === 0 ? (
          <p>No physical rocket on the grid.</p>
        ) : (
          physicalRockets.map((rocket) => (
            <p key={rocket.rocketId}>
              {rocket.rocketId}: {describeRocketStatus(rocket)}
            </p>
          ))
        )}
      </div>
      <div className="game-grid" style={{ gridTemplateColumns: `repeat(${grid.size}, 1fr)` }}>
        {grid.cells.map((cell) => (
          <Cell
            key={cell.id}
            cell={cell}
            content={getRocketContent(rockets, cell.id)}
            onClick={onCellClick}
          />
        ))}
      </div>
    </section>
  );
}
