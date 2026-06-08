import { UNIT_META } from '../lib/gameData.js';

const resolveIcon = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return UNIT_META[content]?.icon ?? content;
  return UNIT_META[content.type]?.icon ?? '?';
};

const resolveLabel = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return UNIT_META[content]?.label ?? content;
  return UNIT_META[content.type]?.label ?? content.type;
};

export default function Cell({ cell, display, selected, movable, onClick }) {
  const icon = resolveIcon(display.content);
  const label = resolveLabel(display.content);
  const state = display.state;

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
      onClick={() => onClick(cell.id)}
      className={`relative flex aspect-square items-center justify-center border border-blue-200/80 text-xl transition hover:bg-blue-100/70 ${tone} ${selected ? 'ring-2 ring-red-500 z-10' : ''} ${movable ? 'after:absolute after:h-2 after:w-2 after:rounded-full after:bg-red-500/80' : ''}`}
    >
      {state === 'unknown' ? '?' : icon}
      <span className="absolute bottom-0.5 right-0.5 text-[0.55rem] leading-none text-blue-400/70">
        {cell.coords}
      </span>
      {display.turnDetected && (
        <span className="absolute left-0.5 top-0.5 text-[0.55rem] leading-none text-red-400">
          {display.turnDetected}
        </span>
      )}
    </button>
  );
}
