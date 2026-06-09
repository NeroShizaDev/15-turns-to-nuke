import React from 'react';

function getBuildingClasses(segment) {
  if (segment?.kind !== 'building') {
    return '';
  }

  return [
    'cell--building',
    `cell--building-${segment.type}`,
    `cell--owner-${segment.owner}`,
    segment.damaged ? 'cell--damaged' : '',
    segment.segmentIndex === 0 ? 'cell--origin' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export default function Cell({ cell, onSelect }) {
  const content = cell.content;
  const label = content?.kind === 'building'
    ? `${content.type} #${content.segmentIndex + 1}${content.damaged ? ' damaged' : ''}`
    : '';

  return (
    <button
      type="button"
      className={`cell ${getBuildingClasses(content)}`}
      data-cell-id={cell.id}
      data-building-id={content?.kind === 'building' ? content.buildingId : undefined}
      data-origin-id={content?.kind === 'building' ? content.originId : undefined}
      data-segment-index={content?.kind === 'building' ? content.segmentIndex : undefined}
      onClick={() => onSelect?.(cell)}
      aria-label={label || `empty cell ${cell.id}`}
    >
      {content?.kind === 'building' ? (
        <span className="cell__building-segment" title={label}>
          {content.segmentIndex === 0 ? content.type : '•'}
          {content.damaged ? '!' : ''}
        </span>
      ) : null}
    </button>
  );
}
