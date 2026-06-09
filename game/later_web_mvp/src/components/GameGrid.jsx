import React from 'react';
import Cell from './Cell.jsx';

export default function GameGrid({ grid, onCellSelect }) {
  const cells = Object.values(grid).sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return (
    <div className="game-grid" role="grid">
      {cells.map((cell) => (
        <Cell key={cell.id} cell={cell} onSelect={onCellSelect} />
      ))}
    </div>
  );
}
