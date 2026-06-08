export const GRID_SIZE = 10;
export const PLAYERS = ['p1', 'p2'];

export const PLAYER_LABELS = {
  p1: 'Игрок 1',
  p2: 'Игрок 2',
};

export const UNIT_META = {
  infantry: { icon: '♙', label: 'Пехота' },
  scout: { icon: '⌂', label: 'Разведчик' },
  engineer: { icon: '⚙', label: 'Инженер' },
  saboteur: { icon: '☻', label: 'Диверсант' },
  artillery: { icon: '▣', label: 'Артиллерия' },
  base: { icon: '□', label: 'База' },
  hq: { icon: '▦', label: 'Главная база' },
  rocketSilo: { icon: '▧', label: 'Ракетная шахта' },
};

export const ACTION_POINTS_PER_TURN = 6;

export const idToCoord = (id) => {
  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];
  return `${letters[id % GRID_SIZE]}${Math.floor(id / GRID_SIZE) + 1}`;
};

export const makeCell = (id) => ({
  id,
  coords: idToCoord(id),
  x: id % GRID_SIZE,
  y: Math.floor(id / GRID_SIZE),
  content: null,
  p1View: { state: 'unknown' },
  p2View: { state: 'unknown' },
  marks: [],
});

export const getEnemy = (player) => (player === 'p1' ? 'p2' : 'p1');

export const areNeighbors = (a, b) => {
  const ax = a % GRID_SIZE;
  const ay = Math.floor(a / GRID_SIZE);
  const bx = b % GRID_SIZE;
  const by = Math.floor(b / GRID_SIZE);
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
};
