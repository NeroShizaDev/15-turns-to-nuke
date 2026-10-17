import { BUILDINGS, HARVESTER_CAPACITY, UNIT_META } from '../lib/gameData.js';
import { rocketCells } from '../lib/rules.js';
import { MISSED_SPRITE, SPRITES } from '../lib/sprites.js';
import Cell from './Cell.jsx';

// Кусок рисунка здания для одной клетки: ГБ 2×2 и Казарма 2×1 нарисованы целиком.
const buildingSprite = (type, segmentIndex) => {
  if (!SPRITES[type]) return null;
  const { width, height } = BUILDINGS[type].footprint;
  return {
    src: SPRITES[type],
    width,
    height,
    dx: segmentIndex % width,
    dy: Math.floor(segmentIndex / width),
  };
};

const unitSprite = (type, extra = {}) => (SPRITES[type] ? { src: SPRITES[type], ...extra } : null);

const rocketCellAt = (rockets, cellId) => {
  for (const rocket of rockets) {
    if (rocket.status !== 'flying') continue;
    const segment = rocketCells(rocket).find((rocketCell) => rocketCell.id === cellId);
    if (segment) return segment;
  }
  return null;
};

const rocketView = (segment) => ({
  tone: 'rocket',
  icon: segment.hit ? '✕' : '▲',
  label: segment.hit ? 'Ракета, клетка подбита' : 'Ядерная ракета',
});

// Своя карта: реальные клетки + следы вражеских выстрелов.
const ownView = (cell, rockets) => {
  const segment = rocketCellAt(rockets, cell.id);
  if (segment) return rocketView(segment);

  const shotMark = cell.shot === 'hit' ? '✕' : cell.shot === 'miss' ? '•' : null;
  const { content } = cell;

  if (!content) {
    return { tone: 'empty', icon: '', topRight: shotMark, topRightClass: 'text-red-400', label: shotMark ? 'сюда стрелял противник' : '' };
  }

  if (content.kind === 'ruin') {
    return {
      tone: 'ruin',
      icon: '※',
      bottomLeft: `$${content.salvage}`,
      topRight: shotMark,
      label: `Руины${content.from ? ` (${BUILDINGS[content.from.type].label})` : ''}, обломков на $${content.salvage}`,
    };
  }

  // Все клетки здания рисуются одинаково: здание стоит целиком, а не «достраивается».
  if (content.kind === 'building') {
    return {
      tone: 'building',
      icon: UNIT_META[content.type].icon,
      sprite: buildingSprite(content.type, content.segmentIndex),
      label: `${BUILDINGS[content.type].label} — клик откроет меню здания`,
    };
  }

  const meta = UNIT_META[content.type];
  const spent = content.ap === 0 || (content.cooldown ?? 0) > 0;
  return {
    tone: 'own',
    icon: meta.icon,
    sprite: unitSprite(content.type),
    faded: spent,
    topLeft: content.cooldown > 0 ? `CD${content.cooldown}` : null,
    bottomLeft: content.type === 'harvester' && content.cargo > 0 ? `${content.cargo}/${HARVESTER_CAPACITY}` : null,
    label: `${meta.label}${content.type === 'harvester' ? `, груз $${content.cargo ?? 0}` : ''}${spent ? ' (уже действовал)' : ''}`,
  };
};

// Карта противника: только то, что ты узнал разведкой и выстрелами.
const enemyView = (cell, rockets) => {
  const segment = rocketCellAt(rockets, cell.id);
  if (segment) return rocketView(segment);

  const { seen } = cell;
  const typeLabel = seen.type ? (UNIT_META[seen.type]?.label ?? '') : '';

  switch (seen.state) {
    case 'unit':
    case 'building':
      return { tone: 'enemy', icon: UNIT_META[seen.type].icon, sprite: unitSprite(seen.type, { enemy: true }), topLeft: seen.turn, label: `${typeLabel} (видели на ходу ${seen.turn})` };
    case 'ghost':
      return { tone: 'ghost', icon: UNIT_META[seen.type].icon, sprite: unitSprite(seen.type), faded: true, topLeft: seen.turn, label: `${typeLabel} был тут на ходу ${seen.turn}` };
    case 'ruin':
      return { tone: 'hit', icon: '✕', topLeft: seen.turn, label: `попадание${typeLabel ? `: ${typeLabel}` : ''}` };
    case 'empty':
      if (seen.shot === 'kill') return { tone: 'hit', icon: '✕', topLeft: seen.turn, label: `убит ${typeLabel}` };
      if (seen.shot === 'miss') return { tone: 'miss', icon: '•', sprite: { src: MISSED_SPRITE }, faded: true, topLeft: seen.turn, topLeftClass: 'text-blue-300', label: `мимо (ход ${seen.turn}) — с тех пор могли отстроиться` };
      return { tone: 'miss', icon: '·', topLeft: seen.turn, topLeftClass: 'text-blue-300', label: `пусто на ходу ${seen.turn}` };
    default:
      return { tone: 'unknown', icon: '', label: 'не разведано' };
  }
};

export default function GameGrid({
  title,
  mode,
  board,
  rockets,
  selectedIds,
  aimCell,
  highlights,
  onCellClick,
}) {
  const getView = mode === 'own' ? ownView : enemyView;

  return (
    <section>
      <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-[0.35em] text-blue-950">
        {title}
      </h3>
      <div className={`grid grid-cols-10 overflow-hidden border-2 ${mode === 'enemy' ? 'border-red-300' : 'border-blue-400'} bg-white/75 shadow-inner`}>
        {board.map((cell) => (
          <Cell
            key={`${mode}-${cell.id}`}
            cell={cell}
            view={getView(cell, rockets)}
            selected={mode === 'own' && selectedIds.has(cell.id)}
            aimed={mode === 'enemy' && aimCell === cell.id}
            actionable={highlights.has(cell.id)}
            onClick={onCellClick}
          />
        ))}
      </div>
    </section>
  );
}
