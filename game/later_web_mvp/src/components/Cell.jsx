// Одна клетка тетрадного поля. Что рисовать, решает GameGrid: сюда приходит готовый view.
const TONES = {
  own: 'text-blue-950 bg-blue-50/70',
  building: 'text-blue-950 bg-blue-200/70 font-black',
  enemy: 'text-red-700 bg-red-50/80',
  ghost: 'text-slate-500 bg-slate-100/70 opacity-70 italic',
  ruin: 'text-amber-800 bg-amber-100/70',
  hit: 'text-red-600 bg-red-100/70 font-black',
  miss: 'text-blue-400 bg-white/60',
  rocket: 'text-white bg-red-600',
  unknown: 'bg-slate-100/60',
  empty: 'text-blue-200 bg-white/40',
};

// Рисунок ручкой поверх тетрадной клетки: multiply убирает белый фон бумаги.
// Здание шире клетки режется через background-position, чтобы рисунок лёг на всё здание.
function Sprite({ sprite, faded }) {
  const style = { mixBlendMode: 'multiply', opacity: faded ? 0.45 : 1 };
  if (sprite.enemy) style.filter = 'sepia(1) saturate(6) hue-rotate(-50deg)';

  if (sprite.width) {
    const x = sprite.width > 1 ? (sprite.dx / (sprite.width - 1)) * 100 : 0;
    const y = sprite.height > 1 ? (sprite.dy / (sprite.height - 1)) * 100 : 0;
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-no-repeat"
        style={{
          ...style,
          backgroundImage: `url(${sprite.src})`,
          backgroundSize: `${sprite.width * 100}% ${sprite.height * 100}%`,
          backgroundPosition: `${x}% ${y}%`,
        }}
      />
    );
  }

  return <img src={sprite.src} alt="" aria-hidden="true" className="pointer-events-none h-3/4 w-3/4 object-contain" style={style} />;
}

export default function Cell({ cell, view, selected, aimed, actionable, onClick }) {
  return (
    <button
      type="button"
      title={`${cell.coords}${view.label ? ` — ${view.label}` : ''}`}
      aria-label={`${cell.coords}${view.label ? ` — ${view.label}` : ''}`}
      data-cell-id={cell.id}
      onClick={() => onClick(cell.id)}
      className={`relative flex aspect-square items-center justify-center border border-blue-200/80 text-xl transition hover:bg-blue-100/70 ${TONES[view.tone] ?? TONES.empty} ${selected ? 'z-10 ring-2 ring-red-500' : ''} ${aimed ? 'z-10 ring-2 ring-red-400/70' : ''} ${actionable ? 'after:absolute after:h-2 after:w-2 after:rounded-full after:bg-red-500/80' : ''}`}
    >
      {view.sprite
        ? <Sprite sprite={view.sprite} faded={view.faded} />
        : <span className={view.faded ? 'opacity-50' : ''}>{view.icon}</span>}

      {view.topLeft && (
        <span className={`absolute left-0.5 top-0.5 text-[0.55rem] font-bold leading-none ${view.topLeftClass ?? 'text-red-400'}`}>
          {view.topLeft}
        </span>
      )}

      {view.topRight && (
        <span className={`absolute right-0.5 top-0.5 text-[0.6rem] font-black leading-none ${view.topRightClass ?? 'text-red-600'}`}>
          {view.topRight}
        </span>
      )}

      {view.bottomLeft && (
        <span className="absolute bottom-0.5 left-0.5 text-[0.55rem] font-bold leading-none text-amber-700">
          {view.bottomLeft}
        </span>
      )}

      <span className="absolute bottom-0.5 right-0.5 text-[0.55rem] leading-none text-blue-400/70">
        {cell.coords}
      </span>
    </button>
  );
}
