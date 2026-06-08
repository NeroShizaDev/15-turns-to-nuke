import GameGrid from './components/GameGrid.jsx';
import TransitionScreen from './components/TransitionScreen.jsx';
import { PLAYER_LABELS } from './lib/gameData.js';
import { useGameStore } from './store/useGameStore.js';

export default function App() {
  const {
    turn,
    phase,
    activePlayer,
    money,
    actionPoints,
    selectedCell,
    log,
    grid,
    selectCell,
    revealCell,
    nextTurn,
    clearSelection,
  } = useGameStore();

  return (
    <main className="min-h-screen bg-slate-200 p-4 font-mono text-blue-950 sm:p-8">
      {phase === 'TRANSITION' && <TransitionScreen />}

      <div className="notebook-paper relative mx-auto max-w-7xl overflow-hidden border-l-4 border-red-200 bg-white p-5 shadow-2xl sm:p-8">
        <div className="relative z-10 flex flex-col gap-5 border-b-2 border-blue-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.45em] text-red-500">Web MVP</p>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Клеточная Война</h1>
            <p className="text-sm">Ход: <span className="font-bold text-red-600">{turn} / 15</span> · Активен: <span className="font-bold">{PLAYER_LABELS[activePlayer]}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right sm:grid-cols-3">
            <div>
              <p className="text-2xl font-bold">$ {money[activePlayer]}</p>
              <p className="text-[0.65rem] uppercase opacity-60">Бюджет</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{actionPoints[activePlayer]}</p>
              <p className="text-[0.65rem] uppercase opacity-60">ОД</p>
            </div>
            <div>
              <p className="text-2xl font-bold">15</p>
              <p className="text-[0.65rem] uppercase opacity-60">Ядерка</p>
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
            onCellClick={selectCell}
          />

          <GameGrid
            title="Карта противника"
            mode="enemy"
            grid={grid}
            activePlayer={activePlayer}
            selectedCell={selectedCell}
            onCellClick={revealCell}
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
                <button
                  type="button"
                  className="border-2 border-red-800 px-4 py-2 text-sm font-bold uppercase text-red-800 opacity-60"
                  title="Следующая итерация MVP"
                >
                  Арт-обстрел (скоро)
                </button>
                <button
                  type="button"
                  onClick={nextTurn}
                  className="bg-red-600 px-4 py-3 text-sm font-black uppercase text-white shadow-lg transition hover:scale-[1.02] hover:bg-red-700"
                >
                  Завершить ход
                </button>
              </div>
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
              <p className="font-black uppercase">Правило призраков</p>
              <p>Если юнит ушёл из разведанной клетки, противник видит старый след с номером хода, но не реальную позицию.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
