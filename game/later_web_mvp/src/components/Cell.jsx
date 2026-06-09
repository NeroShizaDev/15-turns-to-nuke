export default function Cell({ cell, content, onClick }) {
  const rocketClass = content?.kind === 'rocket' ? ` cell--rocket cell--${content.rocketSegment}` : '';
  const damagedClass = content?.damaged ? ' cell--rocket-damaged' : '';

  return (
    <button
      type="button"
      className={`cell${rocketClass}${damagedClass}`}
      aria-label={`${cell.id}${content?.kind === 'rocket' ? ` rocket ${content.rocketSegment}` : ''}`}
      onClick={() => onClick?.(cell.id)}
    >
      <span className="cell__coord">{cell.id}</span>
      {content?.kind === 'rocket' ? (
        <span className="cell__rocket" title={`${content.owner} ${content.rocketId}`}>
          🚀 {content.rocketSegment}
        </span>
      ) : null}
      {cell.structure?.kind === 'rocketSilo' ? <span className="cell__silo">silo</span> : null}
    </button>
  );
}
