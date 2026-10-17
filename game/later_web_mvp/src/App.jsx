import GameGrid from './components/GameGrid.jsx';
import TransitionScreen from './components/TransitionScreen.jsx';
import {
  BUILDABLE_BUILDINGS,
  BUILDINGS,
  HARVESTER_CAPACITY,
  HIREABLE_UNITS,
  MAX_HIRES_PER_TURN,
  PLAYER_LABELS,
  REPAIR_COST_PER_SEGMENT,
  ROCKET_LAUNCH_TURNS,
  SABOTEUR_STEAL,
  UNIT_META,
} from './lib/gameData.js';
import { getStorageCapacity, useGameStore } from './store/useGameStore.js';

// Где нанимается юнит: подпись берётся из hireUnits зданий.
const HIRED_AT = Object.fromEntries(HIREABLE_UNITS.map((unitType) => [
  unitType,
  Object.values(BUILDINGS).filter((building) => building.hireUnits.includes(unitType)).map((building) => building.label).join(' / '),
]));

export default function App() {
  const {
    turn,
    phase,
    activePlayer,
    money,
    actionPoints,
    rocketProgress,
    rockets,
    winner,
    hiredThisTurn,
    selectedCell,
    buildMode,
    structureMode,
    engineerMode,
    log,
    grid,
    selectCell,
    nextTurn,
    clearSelection,
    setBuildMode,
    setStructureMode,
    setEngineerMode,
  } = useGameStore();

  const selectedContent = selectedCell !== null ? grid[selectedCell]?.content : null;
  const storageCapacity = getStorageCapacity(grid, activePlayer);
  const isStorageFull = money[activePlayer] >= storageCapacity;

  return (
    <main className="min-h-screen bg-slate-200 p-4 font-mono text-blue-950 sm:p-8">
      {phase === 'TRANSITION' && <TransitionScreen />}

      <div className="notebook-paper relative mx-auto max-w-7xl overflow-hidden border-l-4 border-red-200 bg-white p-5 shadow-2xl sm:p-8">
        <div className="relative z-10 flex flex-col gap-5 border-b-2 border-blue-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.45em] text-red-500">Web MVP</p>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Клеточная Война</h1>
            <p className="text-sm">
              Ход: <span className="font-bold text-red-600">{turn} / 15</span>
              {' '}· Активен: <span className="font-bold">{PLAYER_LABELS[activePlayer]}</span>
              {winner && <span className="ml-2 font-black text-red-600">Победил {PLAYER_LABELS[winner]}</span>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right sm:grid-cols-4">
            <div>
              <p className="text-2xl font-bold">
                $ {money[activePlayer]}
                <span className={`text-sm ${isStorageFull ? 'text-red-600' : 'opacity-60'}`}> / {storageCapacity}</span>
              </p>
              <p className="text-[0.65rem] uppercase opacity-60">Деньги / хранилище</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{actionPoints[activePlayer]}</p>
              <p className="text-[0.65rem] uppercase opacity-60">ОД</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{rocketProgress[activePlayer]}</p>
              <p className="text-[0.65rem] uppercase opacity-60">Ядерка</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{ROCKET_LAUNCH_TURNS}</p>
              <p className="text-[0.65rem] uppercase opacity-60">Пуск</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 grid gap-8 xl:grid-cols-[1fr_1fr_20rem]">
          <GameGrid
            title="Твоя карта"
            mode="own"
            grid={grid}
            rockets={rockets}
            activePlayer={activePlayer}
            selectedCell={selectedCell}
            buildMode={buildMode}
            structureMode={structureMode}
            engineerMode={engineerMode}
            onCellClick={selectCell}
          />

          <GameGrid
            title="Карта противника"
            mode="enemy"
            grid={grid}
            rockets={rockets}
            activePlayer={activePlayer}
            selectedCell={selectedCell}
            buildMode={buildMode}
            structureMode={structureMode}
            engineerMode={engineerMode}
            onCellClick={selectCell}
          />

          <aside className="space-y-4">
            <div className="border-2 border-blue-200 bg-white/70 p-4">
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest">Панель действий</h2>
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="border-2 border-blue-800 px-4 py-2 text-sm font-bold uppercase transition hover:bg-blue-800 hover:text-white"
                >
                  Снять выбор
                </button>
                {selectedContent?.type === 'engineer' && (
                  <div className="border border-amber-200 bg-amber-50/60 p-3">
                    <p className="mb-1 text-xs font-black uppercase tracking-widest">Инженер: построить</p>
                    <p className="mb-2 text-[0.65rem] uppercase text-amber-700/80">Выбери здание, затем пустую клетку рядом с инженером.</p>
                    <div className="grid gap-2">
                      {BUILDABLE_BUILDINGS.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setStructureMode(type)}
                          className={`border px-3 py-2 text-left text-xs font-bold uppercase transition ${structureMode === type ? 'border-red-600 bg-red-100 text-red-800' : 'border-amber-300 hover:bg-amber-100'}`}
                        >
                          {UNIT_META[type].icon} {BUILDINGS[type].label} — ${BUILDINGS[type].cost}
                          <span className="block text-[0.6rem] font-normal normal-case opacity-70">
                            {BUILDINGS[type].income > 0 ? `+$${BUILDINGS[type].income}/ход · ` : ''}хранит {BUILDINGS[type].storage}
                            {BUILDINGS[type].receivesCargo ? ' · приём груза' : ''}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setEngineerMode('dismantle')}
                        className={`border px-3 py-2 text-left text-xs font-bold uppercase transition ${engineerMode === 'dismantle' ? 'border-red-600 bg-red-100 text-red-800' : 'border-amber-300 hover:bg-amber-100'}`}
                      >
                        ✂ Разобрать здание — вернуть 50%
                      </button>
                    </div>
                  </div>
                )}
                <div className="border border-blue-100 bg-blue-50/50 p-3">
                  <p className="mb-1 text-xs font-black uppercase tracking-widest">Нанять у своих зданий</p>
                  <p className="mb-2 text-[0.65rem] uppercase text-blue-700/70">Лимит: {hiredThisTurn[activePlayer]} / {MAX_HIRES_PER_TURN}</p>
                  <div className="grid gap-2">
                    {HIREABLE_UNITS.map((unitType) => (
                      <button
                        key={unitType}
                        type="button"
                        onClick={() => setBuildMode(unitType)}
                        className={`border px-3 py-2 text-left text-xs font-bold uppercase transition ${buildMode === unitType ? 'border-red-600 bg-red-100 text-red-800' : 'border-blue-300 hover:bg-blue-100'}`}
                      >
                        {UNIT_META[unitType].icon} {UNIT_META[unitType].label} — ${UNIT_META[unitType].cost}
                        <span className="block text-[0.6rem] font-normal normal-case opacity-70">у: {HIRED_AT[unitType]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={nextTurn}
                  disabled={Boolean(winner)}
                  className="bg-red-600 px-4 py-3 text-sm font-black uppercase text-white shadow-lg transition hover:scale-[1.02] hover:bg-red-700 disabled:opacity-50"
                >
                  Завершить ход
                </button>
              </div>
            </div>

            <div className="border-2 border-blue-200 bg-white/70 p-4 text-xs leading-relaxed">
              <h2 className="mb-2 text-sm font-black uppercase tracking-widest">Подсказка</h2>
              {structureMode ? (
                <p>Строим: <b>{BUILDINGS[structureMode].label}</b> за ${BUILDINGS[structureMode].cost}. Кликни пустую клетку рядом с инженером или своим зданием.</p>
              ) : engineerMode === 'dismantle' ? (
                <p>Разборка: кликни своё здание рядом с инженером. Вернётся 50% цены целых сегментов и 25% повреждённых; что не влезет в хранилища — останется руинами.</p>
              ) : selectedContent?.type === 'engineer' ? (
                <p>Инженер выбран: выбери здание в панели и поставь рядом. Начни с <b>Главной базы</b> — она даёт доход и хранит деньги. Клик по своему повреждённому сегменту рядом — ремонт за ${REPAIR_COST_PER_SEGMENT}.</p>
              ) : buildMode ? (
                <p>Выбран найм: <b>{UNIT_META[buildMode].label}</b>. Кликни пустую клетку рядом с целым зданием: {HIRED_AT[buildMode]}.</p>
              ) : selectedContent?.type === 'harvester' ? (
                <p>Сборщик (груз {selectedContent.cargo ?? 0}/{HARVESTER_CAPACITY}): кликни соседние руины <b>※</b> — погрузка за 1 ОД. Рядом со своей Главной базой или Складом груз выгружается сам.</p>
              ) : selectedContent?.type === 'saboteur' ? (
                <p>Диверсант выбран: клик по соседнему вражескому зданию — кража до ${SABOTEUR_STEAL} из хранилища за 2 ОД. После кражи жертва тебя заметит.</p>
              ) : selectedContent?.type === 'artillery' ? (
                <p>Артиллерия выбрана: кликни любую клетку на карте противника в радиусе 4. Даже <b>?</b> можно обстрелять вслепую за 2 ОД.</p>
              ) : selectedContent?.type === 'scout' ? (
                <p>Разведчик выбран: соседняя пустая клетка будет разведана, соседний враг — атакован.</p>
              ) : selectedContent ? (
                <p>{UNIT_META[selectedContent.type].label} выбран: соседняя пустая клетка — движение, соседний враг — ближняя атака.</p>
              ) : (
                <p>Выбери свой юнит. Серая точка значит, что юнит уже потратил действие или находится на перезарядке.</p>
              )}
            </div>

            <div className="border-2 border-blue-200 bg-white/70 p-4">
              <h2 className="mb-3 text-sm font-black uppercase tracking-widest">Журнал</h2>
              <ol className="space-y-2 text-xs leading-relaxed">
                {log.map((entry, index) => (
                  <li key={`${entry}-${index}`} className="border-b border-blue-100 pb-2 last:border-b-0">
                    {entry}
                  </li>
                ))}
              </ol>
            </div>

            <div className="border-2 border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
              <p className="font-black uppercase">Экономика: здания — это спайс</p>
              <p>Деньги лежат в зданиях: доход сверх хранилища сгорает. Разрушенный сегмент становится руинами <b>※</b> с его ценой и высыпавшимися деньгами — их вывозит Сборщик любой стороны.</p>
            </div>

            <div className="border-2 border-red-200 bg-red-50/70 p-4 text-xs leading-relaxed text-red-900">
              <p className="font-black uppercase">Правило призраков и ядерки</p>
              <p>Старый след врага остаётся как ghost. Ракетная шкала растёт только пока у игрока жива шахта.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
