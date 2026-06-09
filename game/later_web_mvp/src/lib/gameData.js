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
  saboteur: { icon: '☻', label: 'Диверсант', kind: 'unit', cost: 15, description: 'Скрытый юнит для кражи ресурсов.' },
  artillery: { icon: '▣', label: 'Артиллерия', kind: 'unit', cost: 20, range: 4, actionCost: 2, description: 'Выстрел на 4 клетки только по разведанной цели, затем 4 своих хода перезарядки.' },
  base: { icon: '□', label: 'База', kind: 'building' },
  barracks: { icon: '▤', label: 'Казарма', kind: 'building' },
  hq: { icon: '▦', label: 'Главная база', kind: 'building' },
  rocketSilo: { icon: '▧', label: 'Ракетная шахта', kind: 'building', cost: 30 },
  nuclearRocket: { icon: '▲', label: 'Ядерная ракета', kind: 'rocket' },
};

export const BUILDING_META = {
  base: { width: 1, height: 1, income: 5 },
  barracks: { width: 2, height: 1, income: 0 },
  hq: { width: 2, height: 2, income: 20 },
  rocketSilo: { width: 2, height: 2, income: 0 },
};

export const ROCKET_META = {
  nuclearRocket: { width: 2, height: 2 },
};

export const HIREABLE_UNITS = ['infantry', 'scout', 'engineer', 'artillery', 'saboteur'];
export const ACTION_POINTS_PER_TURN = 6;
export const MAX_HIRES_PER_TURN = 2;
export const ARTILLERY_RANGE = 4;
export const ARTILLERY_ACTION_COST = 2;
export const ARTILLERY_COOLDOWN_OWN_TURNS = 4;
export const SABOTEUR_ACTION_COST = 2;
export const ENGINEER_REPAIR_COST = 10;
export const SABOTEUR_STEAL_AMOUNT = 5;
export const ROCKET_LAUNCH_TURNS = 15;

export const idToCoord = (id) => {
  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];
  return `${letters[id % GRID_SIZE]}${Math.floor(id / GRID_SIZE) + 1}`;
};

export const xyToId = (x, y) => y * GRID_SIZE + x;

export const isInsideGrid = (x, y) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;

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
