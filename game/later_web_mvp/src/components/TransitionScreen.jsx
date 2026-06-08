import { PLAYER_LABELS } from '../lib/gameData.js';
import { useGameStore } from '../store/useGameStore.js';

export default function TransitionScreen() {
  const activePlayer = useGameStore((state) => state.activePlayer);
  const turn = useGameStore((state) => state.turn);
  const startActionPhase = useGameStore((state) => state.startActionPhase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/95 p-6 text-center text-white">
      <div className="max-w-xl border-2 border-red-300 bg-white/10 p-8 shadow-2xl backdrop-blur">
        <p className="mb-2 text-sm uppercase tracking-[0.45em] text-red-200">Hotseat transition</p>
        <h2 className="mb-4 text-4xl font-black uppercase">Передай управление</h2>
        <p className="mb-8 text-xl">
          Сейчас ходит <span className="font-bold text-red-200">{PLAYER_LABELS[activePlayer]}</span>, ход {turn} / 15.
        </p>
        <button
          type="button"
          onClick={startActionPhase}
          className="border-2 border-white px-8 py-3 font-bold uppercase transition hover:bg-white hover:text-blue-950"
        >
          Начать ход
        </button>
      </div>
    </div>
  );
}
