export const GRID_SIZE = 10;
export const PLAYERS = ['p1', 'p2'];

export const PLAYER_LABELS = {
  p1: 'Игрок 1',
  p2: 'Игрок 2',
};

export const UNIT_META = {
  infantry: { icon: '♙', label: 'Пехота', kind: 'unit', cost: 10, description: 'Ближний бой, ответный удар пехоты.' },
  scout: { icon: '⌂', label: 'Разведчик', kind: 'unit', cost: 8, description: 'Открывает соседние клетки без выстрела вслепую.' },
  engineer: { icon: '⚙', label: 'Инженер', kind: 'unit', cost: 15, description: 'Резерв под строительство и ремонт.' },
  saboteur: { icon: '☻', label: 'Диверсант', kind: 'unit', cost: 15, description: 'Скрытый юнит для будущих краж ресурсов.' },
  artillery: { icon: '▣', label: 'Артиллерия', kind: 'unit', cost: 20, range: 4, actionCost: 2, description: 'Слепой выстрел на 4 клетки, затем ход перезарядки.' },
  base: { icon: '□', label: 'База', kind: 'building' },
  hq: { icon: '▦', label: 'Главная база', kind: 'building' },
  rocketSilo: { icon: '▧', label: 'Ракетная шахта', kind: 'building', cost: 30 },
};

export const HIREABLE_UNITS = ['infantry', 'scout', 'artillery'];
export const ACTION_POINTS_PER_TURN = 6;
export const MAX_HIRES_PER_TURN = 2;
export const ARTILLERY_RANGE = 4;
export const ARTILLERY_ACTION_COST = 2;
export const ROCKET_LAUNCH_TURNS = 15;

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

export const getDistance = (a, b) => {
  const ax = a % GRID_SIZE;
  const ay = Math.floor(a / GRID_SIZE);
  const bx = b % GRID_SIZE;
  const by = Math.floor(b / GRID_SIZE);
  return Math.abs(ax - bx) + Math.abs(ay - by);
};

export const areNeighbors = (a, b) => getDistance(a, b) === 1;

export const isInRange = (a, b, range) => getDistance(a, b) <= range;
