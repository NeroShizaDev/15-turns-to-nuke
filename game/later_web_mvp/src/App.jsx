import GameGrid from './components/GameGrid.jsx';
import TransitionScreen from './components/TransitionScreen.jsx';
import { HIREABLE_UNITS, MAX_HIRES_PER_TURN, PLAYER_LABELS, ROCKET_LAUNCH_TURNS, UNIT_META } from './lib/gameData.js';
import { useGameStore } from './store/useGameStore.js';

export default function App() {
  const {
    turn,
    phase,
    activePlayer,
    money,
    actionPoints,
    rocketProgress,
    winner,
    hiredThisTurn,
    selectedCell,
    buildMode,
    log,
    grid,
    selectCell,
    nextTurn,
    clearSelection,
    setBuildMode,
  } = useGameStore();

  const selectedContent = selectedCell !== null ? grid[selectedCell]?.content : null;

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
              <p className="text-2xl font-bold">$ {money[activePlayer]}</p>
              <p className="text-[0.65rem] uppercase opacity-60">Бюджет</p>
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
            activePlayer={activePlayer}
            selectedCell={selectedCell}
            buildMode={buildMode}
            onCellClick={selectCell}
          />

          <GameGrid
            title="Карта противника"
            mode="enemy"
            grid={grid}
            activePlayer={activePlayer}
            selectedCell={selectedCell}
            buildMode={buildMode}
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
                <div className="border border-blue-100 bg-blue-50/50 p-3">
                  <p className="mb-1 text-xs font-black uppercase tracking-widest">Нанять возле базы</p>
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
              {buildMode ? (
                <p>Выбран найм: <b>{UNIT_META[buildMode].label}</b>. Кликни пустую клетку рядом со своей базой или HQ.</p>
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
