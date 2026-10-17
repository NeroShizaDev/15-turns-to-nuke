import GameGrid from './components/GameGrid.jsx';
import TransitionScreen from './components/TransitionScreen.jsx';
import {
  BUILDABLE_BUILDINGS,
  BUILDINGS,
  GRID_SIZE,
  HARVESTER_CAPACITY,
  REPAIR_COST_PER_SEGMENT,
  ROCKET_LAUNCH_TURNS,
  SABOTEUR_STEAL,
  UNIT_META,
  getDistance,
  getEnemy,
  getNeighborIds,
  getSegmentCount,
  getSegmentIncome,
  getSegmentStorage,
} from './lib/gameData.js';
import {
  getPlacementError,
  getReadyCounts,
  getSegments,
  getStorageCapacity,
  hasBuilding,
  hasBuildingActed,
  isRepairableRuin,
  playerLabel,
  rocketCells,
} from './lib/rules.js';
import { SPRITES } from './lib/sprites.js';
import { getViewer, useGameStore } from './store/useGameStore.js';

// Миниатюра из тетради в меню; если рисунка нет — значок.
const Icon = ({ type }) => (SPRITES[type]
  ? <img src={SPRITES[type]} alt="" className="mr-1 inline-block h-5 w-auto align-middle" style={{ mixBlendMode: 'multiply' }} />
  : <span className="mr-1">{UNIT_META[type].icon}</span>);

const EMPTY = new Set();

// Точки-подсказки: куда можно кликнуть на своей карте и куда достаёт выбранный юнит на карте противника.
const computeHighlights = (state, viewer) => {
  const own = new Set();
  const enemy = new Set();
  if (state.phase !== 'ACTION' || state.winner || state.activePlayer !== viewer) return { own, enemy };

  const board = state.boards[viewer];
  const selectedId = state.selectedCell;
  const unit = selectedId !== null ? board[selectedId].content : null;

  if (state.structureMode) {
    const { type, builderId } = state.structureMode;
    board.forEach((cell) => {
      if (getPlacementError(board, type, cell.id, builderId) === null) own.add(cell.id);
    });
  } else if (unit?.kind === 'unit' && state.engineerMode === 'dismantle') {
    getNeighborIds(selectedId).forEach((id) => {
      if (board[id].content?.kind === 'building') own.add(id);
    });
  } else if (unit?.kind === 'unit' && unit.ap > 0 && !(unit.cooldown > 0)) {
    getNeighborIds(selectedId).forEach((id) => {
      const content = board[id].content;
      const harvesterTarget = unit.type === 'harvester' && (content?.kind === 'ruin'
        || (content?.kind === 'building' && BUILDINGS[content.type].receivesCargo && unit.cargo > 0));
      const repairTarget = unit.type === 'engineer' && isRepairableRuin(board, board[id]);
      if (!content || harvesterTarget || repairTarget) own.add(id);
    });

    const { range } = UNIT_META[unit.type];
    if (range !== undefined) {
      for (let id = 0; id < GRID_SIZE * GRID_SIZE; id += 1) {
        if (getDistance(selectedId, id) <= range) enemy.add(id);
      }
    }
  }

  return { own, enemy };
};

const unitHint = (unit) => {
  const meta = UNIT_META[unit.type];
  if (unit.ap === 0 && !(unit.cooldown > 0)) return `${meta.label} уже потратил свой ОД в этот ход. Новые юниты действуют со следующего хода.`;
  switch (unit.type) {
    case 'artillery':
      return `Артиллерия: кликни клетку на карте противника в радиусе ${meta.range} от своей координаты (точки). Можно вслепую. Потом 4 хода перезарядки.`;
    case 'infantry':
      return 'Пехота: бьёт по полю противника в радиусе 1 от своей координаты. Убил вражескую пехоту — с шансом 50% она успеет ответить и положить твою.';
    case 'scout':
      return `Разведчик: тихо вскрывает клетку поля противника в радиусе ${meta.range}. Противник не узнает.`;
    case 'saboteur':
      return `Диверсант: проникает в клетку противника рядом со своей координатой. Если там здание — крадёт до $${SABOTEUR_STEAL}, но его заметят.`;
    case 'engineer':
      return `Инженер — бульдозер из Generals: строит вплотную к себе, где угодно. Клик по руинам своего стоящего здания — восстановить клетку (от $${REPAIR_COST_PER_SEGMENT}).`;
    case 'harvester':
      return `Сборщик (${unit.cargo ?? 0}/${HARVESTER_CAPACITY}): кликни соседние руины ※ — погрузка. У своей ГБ или Склада груз выгружается сам.`;
    default:
      return meta.description;
  }
};

const ResultBanner = ({ winner, mode }) => {
  if (!winner) return null;
  let text = winner === 'draw' ? 'Ничья: обе стороны стёрты' : `Победил ${playerLabel(mode, winner)}`;
  if (mode === 'ai') text = winner === 'p1' ? 'ПОБЕДА! Поле ИИ разбито' : winner === 'p2' ? 'ПОРАЖЕНИЕ: ИИ победил' : text;
  return <span className="ml-2 font-black text-red-600">{text}</span>;
};

const buildingStats = (type) => {
  const data = BUILDINGS[type];
  const parts = [`${data.footprint.width}×${data.footprint.height}`];
  if (data.income > 0) parts.push(`+$${data.income}/ход`);
  parts.push(`хранит ${data.storage}`);
  if (data.receivesCargo) parts.push('приём груза');
  if (data.freeUnit) parts.push(`+${UNIT_META[data.freeUnit].label} в подарок`);
  if (type === 'rocketSilo') parts.push('нижние 3 ряда · видна врагу');
  return parts.join(' · ');
};

const MENU_BUTTON = 'border px-3 py-2 text-left text-xs font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-40';

function BuildList({ types, structureMode, disabled, onPick }) {
  return (
    <div className="grid gap-2">
      {types.map((type) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => onPick(type)}
          className={`${MENU_BUTTON} ${structureMode?.type === type ? 'border-red-600 bg-red-100 text-red-800' : 'border-amber-300 hover:bg-amber-100'}`}
        >
          <Icon type={type} />{BUILDINGS[type].label} — ${BUILDINGS[type].cost}
          <span className="block text-[0.6rem] font-normal normal-case opacity-70">{buildingStats(type)}</span>
        </button>
      ))}
    </div>
  );
}

function BuildingMenu({ state, viewer, building, onBuild, onProduce }) {
  const data = BUILDINGS[building.type];
  const board = state.boards[viewer];
  const alive = getSegments(board, building.buildingId).length;
  const total = getSegmentCount(building.type);
  const acted = hasBuildingActed(state, viewer, building.buildingId);
  const income = Math.floor(getSegmentIncome(building.type) * alive);
  const storage = Math.floor(getSegmentStorage(building.type) * alive);
  const hasMenu = data.builds.length + data.hireUnits.length > 0;

  return (
    <div className="border border-blue-300 bg-blue-50/70 p-3">
      <p className="text-xs font-black uppercase tracking-widest"><Icon type={building.type} />{data.label}</p>
      <p className="mb-2 text-[0.65rem] uppercase text-blue-800/70">
        Цела {alive}/{total} · {income > 0 ? `+$${income}/ход · ` : ''}хранит {storage}
        {hasMenu && (acted ? ' · заказ на этот ход выполнен' : ' · готова к заказу')}
      </p>

      {data.builds.length > 0 && (
        <>
          <p className="mb-1 text-[0.65rem] font-black uppercase">Строить (вплотную к базе)</p>
          <BuildList types={data.builds} structureMode={state.structureMode} disabled={acted} onPick={onBuild} />
        </>
      )}

      {data.hireUnits.length > 0 && (
        <>
          <p className="mb-1 mt-3 text-[0.65rem] font-black uppercase">Выпустить (выйдет к воротам)</p>
          <div className="grid gap-2">
            {data.hireUnits.map((type) => (
              <button
                key={type}
                type="button"
                disabled={acted}
                onClick={() => onProduce(type)}
                className={`${MENU_BUTTON} border-blue-300 hover:bg-blue-100`}
              >
                <Icon type={type} />{UNIT_META[type].label} — ${UNIT_META[type].cost}
                <span className="block text-[0.6rem] font-normal normal-case opacity-70">
                  {UNIT_META[type].range !== undefined ? `радиус ${UNIT_META[type].range} · ` : ''}{UNIT_META[type].description}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {!hasMenu && (
        <p className="text-[0.7rem] leading-relaxed">
          {building.type === 'rocketSilo'
            ? `Копит ядерку: ${state.rocketProgress[viewer]}/${ROCKET_LAUNCH_TURNS}. Её место и таймер видит противник.`
            : 'Ничего не производит: приносит доход и хранит деньги.'}
        </p>
      )}
    </div>
  );
}

export default function App() {
  const state = useGameStore();
  const {
    mode,
    turn,
    phase,
    activePlayer,
    money,
    rocketProgress,
    rockets,
    winner,
    selectedCell,
    structureMode,
    engineerMode,
    notice,
    log,
    boards,
    clickOwnCell,
    clickEnemyCell,
    nextTurn,
    newGame,
    clearSelection,
    produceUnit,
    setStructureMode,
    setEngineerMode,
  } = state;

  const viewer = getViewer(state);
  const foe = getEnemy(viewer);
  const myBoard = boards[viewer];
  const selectedContent = selectedCell !== null ? myBoard[selectedCell]?.content : null;
  const selectedIds = selectedContent?.kind === 'building'
    ? new Set(getSegments(myBoard, selectedContent.buildingId).map((cell) => cell.id))
    : new Set(selectedCell !== null ? [selectedCell] : []);
  const storageCapacity = getStorageCapacity(myBoard);
  const isStorageFull = money[viewer] >= storageCapacity;
  const { ready, total } = getReadyCounts(state, viewer);
  const highlights = computeHighlights(state, viewer);
  const visibleLog = log.filter((entry) => entry.visibleTo === 'all' || entry.visibleTo === viewer);
  const myRockets = rockets.filter((rocket) => rocket.owner === viewer);
  const foeRockets = rockets.filter((rocket) => rocket.owner === foe);
  const foeFlying = foeRockets.find((rocket) => rocket.status === 'flying');
  const myFlying = myRockets.find((rocket) => rocket.status === 'flying');
  const foeHasSilo = hasBuilding(boards[foe], 'rocketSilo');
  const rocketRow = (rocket) => Math.min(...rocketCells(rocket).map((cell) => cell.y)) + 1;
  const isMyTurn = phase === 'ACTION' && !winner && activePlayer === viewer;
  const foeName = mode === 'ai' ? 'ИИ' : 'противника';

  return (
    <main className="min-h-screen bg-slate-200 p-4 font-mono text-blue-950 sm:p-8">
      {phase === 'TRANSITION' && <TransitionScreen />}

      <div className="notebook-paper relative mx-auto max-w-7xl overflow-hidden border-l-4 border-red-200 bg-white p-5 shadow-2xl sm:p-8">
        <div className="relative z-10 flex flex-col gap-5 border-b-2 border-blue-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.45em] text-red-500">Морской бой с базами · {mode === 'ai' ? 'против ИИ' : 'вдвоём'}</p>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Клеточная Война</h1>
            <p className="text-sm">
              Ход: <span className="font-bold text-red-600">{turn}</span>
              {' '}· {phase === 'AI' ? <span className="font-bold text-red-600">ИИ ходит…</span> : <>Ходит: <span className="font-bold">{playerLabel(mode, activePlayer)}</span></>}
              <ResultBanner winner={winner} mode={mode} />
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[0.65rem] font-bold uppercase">
              <button type="button" onClick={() => newGame('ai')} className="border border-blue-800 px-2 py-1 hover:bg-blue-800 hover:text-white">Новая игра против ИИ</button>
              <button type="button" onClick={() => newGame('hotseat')} className="border border-blue-300 px-2 py-1 hover:bg-blue-100">Вдвоём за одним экраном</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right sm:grid-cols-4">
            <div>
              <p className="text-2xl font-bold">
                $ {money[viewer]}
                <span className={`text-sm ${isStorageFull ? 'text-red-600' : 'opacity-60'}`}> / {storageCapacity}</span>
              </p>
              <p className="text-[0.65rem] uppercase opacity-60">Деньги / хранилище</p>
            </div>
            <div title="У каждого юнита 1 ОД за ход, у каждого здания с меню — 1 заказ за ход">
              <p className="text-2xl font-bold">{ready}<span className="text-sm opacity-60"> / {total}</span></p>
              <p className="text-[0.65rem] uppercase opacity-60">Готовы действовать</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{rocketProgress[viewer]}<span className="text-sm opacity-60"> / {ROCKET_LAUNCH_TURNS}</span></p>
              <p className="text-[0.65rem] uppercase opacity-60">Твоя ядерка</p>
            </div>
            <div className={foeHasSilo ? 'text-red-600' : 'opacity-40'}>
              <p className="text-2xl font-bold">{foeHasSilo ? rocketProgress[foe] : '—'}<span className="text-sm opacity-60"> / {ROCKET_LAUNCH_TURNS}</span></p>
              <p className="text-[0.65rem] uppercase">Ядерка {foeName}</p>
            </div>
          </div>
        </div>

        {(foeFlying || myFlying) && (
          <div className="relative z-10 mt-4 space-y-1 border-2 border-red-400 bg-red-50 p-3 text-xs font-bold uppercase text-red-700">
            {foeFlying && <p>⚠ Ракета {foeName} в полёте: ряд {rocketRow(foeFlying)}, подбито {foeFlying.hits.length}/2 — сбей, пока не ушла за верхний край!</p>}
            {myFlying && <p>▲ Твоя ракета летит: ряд {rocketRow(myFlying)}, подбито {myFlying.hits.length}/2.</p>}
          </div>
        )}

        <div className="relative z-10 mt-6 grid gap-8 xl:grid-cols-[1fr_1fr_20rem]">
          <GameGrid
            title="Твоя карта"
            mode="own"
            board={myBoard}
            rockets={myRockets}
            selectedIds={selectedIds}
            highlights={isMyTurn ? highlights.own : EMPTY}
            onCellClick={clickOwnCell}
          />

          <GameGrid
            title="Карта противника"
            mode="enemy"
            board={boards[foe]}
            rockets={foeRockets}
            selectedIds={EMPTY}
            aimCell={selectedContent?.kind === 'unit' && UNIT_META[selectedContent.type].range !== undefined ? selectedCell : null}
            highlights={isMyTurn ? highlights.enemy : EMPTY}
            onCellClick={clickEnemyCell}
          />

          <aside className="space-y-4">
            <div className="border-2 border-blue-200 bg-white/70 p-4">
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest">Панель действий</h2>
              {notice && <p className="mb-3 border border-red-300 bg-red-50 p-2 text-xs text-red-700">{notice}</p>}
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="border-2 border-blue-800 px-4 py-2 text-sm font-bold uppercase transition hover:bg-blue-800 hover:text-white"
                >
                  Снять выбор
                </button>

                {selectedContent?.kind === 'building' && (
                  <BuildingMenu
                    state={state}
                    viewer={viewer}
                    building={selectedContent}
                    onBuild={setStructureMode}
                    onProduce={produceUnit}
                  />
                )}

                {selectedContent?.type === 'engineer' && (
                  <div className="border border-amber-200 bg-amber-50/60 p-3">
                    <p className="mb-1 text-xs font-black uppercase tracking-widest">Инженер: построить рядом с собой</p>
                    <BuildList
                      types={BUILDABLE_BUILDINGS}
                      structureMode={structureMode}
                      disabled={selectedContent.ap === 0}
                      onPick={setStructureMode}
                    />
                    <button
                      type="button"
                      disabled={selectedContent.ap === 0}
                      onClick={() => setEngineerMode('dismantle')}
                      className={`${MENU_BUTTON} mt-2 w-full ${engineerMode === 'dismantle' ? 'border-red-600 bg-red-100 text-red-800' : 'border-amber-300 hover:bg-amber-100'}`}
                    >
                      ✂ Продать здание — вернуть 50%
                    </button>
                  </div>
                )}

                {!selectedContent && (
                  <p className="border border-blue-100 bg-blue-50/50 p-3 text-xs leading-relaxed">
                    Кликни <b>своё здание</b> — откроется его меню, как в Dune: Главная база строит здания и выпускает инженеров, Казарма — бойцов, Склад — Сборщиков. Кликни <b>юнита</b> — увидишь, куда он бьёт.
                  </p>
                )}

                <button
                  type="button"
                  onClick={nextTurn}
                  disabled={!isMyTurn}
                  className="bg-red-600 px-4 py-3 text-sm font-black uppercase text-white shadow-lg transition hover:scale-[1.02] hover:bg-red-700 disabled:opacity-50"
                >
                  Завершить ход
                </button>
              </div>
            </div>

            <div className="border-2 border-blue-200 bg-white/70 p-4 text-xs leading-relaxed">
              <h2 className="mb-2 text-sm font-black uppercase tracking-widest">Подсказка</h2>
              {structureMode ? (
                <p>Строим: <b>{BUILDINGS[structureMode.type].label}</b> за ${BUILDINGS[structureMode.type].cost}. Точки — куда встанет левый верхний угол.</p>
              ) : engineerMode === 'dismantle' ? (
                <p>Продажа: кликни своё здание рядом с инженером. Вернётся 50% цены уцелевших клеток; что не влезет в хранилища — останется руинами.</p>
              ) : selectedContent?.kind === 'unit' ? (
                <p>{unitHint(selectedContent)}</p>
              ) : (
                <p>Как в морском бое: у противника своё поле, ты бьёшь по координатам. Одно попадание сносит одну клетку: ГБ 2×2 умирает с четырёх. У каждого юнита 1 ОД за ход, у каждого здания — 1 заказ.</p>
              )}
            </div>

            <div className="border-2 border-blue-200 bg-white/70 p-4">
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest">Журнал</h2>
              <ol className="max-h-80 space-y-2 overflow-y-auto text-xs leading-relaxed">
                {visibleLog.map((entry) => (
                  <li
                    key={entry.id}
                    className={`border-b border-blue-100 pb-2 last:border-b-0 ${entry.player !== viewer && entry.visibleTo === 'all' ? 'text-red-700' : ''}`}
                  >
                    <span className="opacity-60">Ход {entry.turn} · {playerLabel(mode, entry.player)}:</span> {entry.text}
                  </li>
                ))}
              </ol>
            </div>

            <div className="border-2 border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
              <p className="font-black uppercase">Экономика: здания — это спайс</p>
              <p>Деньги лежат в зданиях: доход и вместимость считаются по уцелевшим клеткам, сверх хранилища доход сгорает. Снесённая клетка становится руинами <b>※</b> — Сборщик вывозит обломки, инженер может восстановить из них клетку.</p>
            </div>

            <div className="border-2 border-red-200 bg-red-50/70 p-4 text-xs leading-relaxed text-red-900">
              <p className="font-black uppercase">Без хитпоинтов</p>
              <p>Попал в здание — клетка снесена (✕). Попал в юнита — он убит сразу. Шахту видно врагу вместе с таймером, как супероружие в Generals. Ракета 2×2 летит вверх и сбита после двух попаданий.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
