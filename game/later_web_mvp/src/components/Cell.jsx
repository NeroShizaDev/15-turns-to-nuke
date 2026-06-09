import { UNIT_META } from '../lib/gameData.js';

const getBuildingClasses = (segment) => {
  if (segment?.kind !== 'building') {
    return '';
  }

  return [
    'cell',
    'cell--building',
    `cell--building-${segment.type}`,
    `cell--owner-${segment.owner}`,
    segment.damaged ? 'cell--damaged' : '',
    segment.segmentIndex === 0 ? 'cell--origin' : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const resolveIcon = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return UNIT_META[content]?.icon ?? content;
  if (content.kind === 'building' && content.segmentIndex > 0) {
    return content.damaged ? '!' : '•';
  }
  return `${UNIT_META[content.type]?.icon ?? '?'}${content.damaged ? '!' : ''}`;
};

const resolveLabel = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return UNIT_META[content]?.label ?? content;

  const label = UNIT_META[content.type]?.label ?? content.type;
  if (content.kind !== 'building') return label;

  const segment = `сегмент ${content.segmentIndex + 1}`;
  return content.damaged ? `${label}, ${segment}, поврежден` : `${label}, ${segment}`;
};

export default function Cell({ cell, display, selected, actionable, onClick, activePlayer }) {
  const icon = resolveIcon(display.content);
  const label = resolveLabel(display.content);
  const state = display.state;
  const visibleSegment = state === 'own' && cell.content?.kind === 'building' ? cell.content : null;
  const isOwnSpentUnit = cell.content?.owner === activePlayer
    && cell.content.kind === 'unit'
    && (cell.content.ap === 0 || (cell.content.cooldown ?? 0) > 0);

  const tone = {
    own: 'text-blue-950 bg-blue-50/70',
    enemy: 'text-red-700 bg-red-50/80',
    ghost: 'text-slate-500 bg-slate-100/70 opacity-70 italic',
    unknown: 'text-slate-300 bg-slate-50/80',
    empty: 'text-blue-200 bg-white/40',
  }[state] ?? 'text-blue-900 bg-white/40';

  return (
    <button
      type="button"
      title={`${cell.coords}${label ? ` — ${label}` : ''}`}
      aria-label={`${cell.coords}${label ? ` — ${label}` : ''}`}
      data-cell-id={cell.id}
      data-building-id={visibleSegment?.buildingId}
      data-origin-id={visibleSegment?.originId}
      data-segment-index={visibleSegment?.segmentIndex}
      onClick={() => onClick(cell.id)}
      className={`relative flex aspect-square items-center justify-center border border-blue-200/80 text-xl transition hover:bg-blue-100/70 ${tone} ${getBuildingClasses(visibleSegment)} ${selected ? 'ring-2 ring-red-500 z-10' : ''} ${actionable ? 'after:absolute after:h-2 after:w-2 after:rounded-full after:bg-red-500/80' : ''}`}
    >
      {state === 'unknown' ? '?' : icon}

      {isOwnSpentUnit && (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full border border-white bg-slate-400 shadow-sm"
          title={cell.content.cooldown > 0 ? 'Перезарядка' : 'Юнит уже действовал'}
        />
      )}

      {cell.content?.owner === activePlayer && cell.content?.cooldown > 0 && (
        <span className="absolute left-0.5 top-0.5 text-[0.55rem] leading-none text-red-500">
          CD{cell.content.cooldown}
        </span>
      )}

      <span className="absolute bottom-0.5 right-0.5 text-[0.55rem] leading-none text-blue-400/70">
        {cell.coords}
      </span>
      {display.turnDetected && !cell.content?.cooldown && (
        <span className="absolute left-0.5 top-0.5 text-[0.55rem] leading-none text-red-400">
          {display.turnDetected}
        </span>
      )}
    </button>
  );
}
