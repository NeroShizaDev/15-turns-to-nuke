export const GRID_SIZE = 10;
export const PLAYERS = ['p1', 'p2'];

export const PLAYER_LABELS = {
  p1: 'Игрок 1',
  p2: 'Игрок 2',
};

// Морской бой с базами: у каждого своё поле, юниты бьют по чужому полю в радиусе range
// от своей координаты. Хитпоинтов нет: одно попадание уничтожает одну клетку.
// Как на скетче: у каждого юнита 1 ОД за ход — либо шаг, либо действие.
export const UNIT_META = {
  infantry: { icon: '♙', label: 'Пехота', kind: 'unit', cost: 10, range: 1, description: 'Бьёт по клетке противника рядом со своей координатой. Убил вражескую пехоту — с шансом 50% она успеет ответить.' },
  scout: { icon: '⌂', label: 'Разведчик', kind: 'unit', cost: 8, range: 3, description: 'Тихо вскрывает 1 клетку поля противника в радиусе 3.' },
  engineer: { icon: '⚙', label: 'Инженер', kind: 'unit', cost: 15, description: 'Бульдозер из Generals: строит рядом с собой, разбирает и восстанавливает клетки зданий.' },
  saboteur: { icon: '☻', label: 'Диверсант', kind: 'unit', cost: 15, range: 1, description: 'Проникает в соседнюю клетку противника: крадёт деньги из здания.' },
  harvester: { icon: '⛟', label: 'Сборщик', kind: 'unit', cost: 20, description: 'Вывозит обломки из своих руин на Склад или главную базу.' },
  artillery: { icon: '▣', label: 'Артиллерия', kind: 'unit', cost: 20, range: 4, description: 'Выстрел на 4 клетки, можно вслепую, затем 4 своих хода перезарядки.' },
  base: { icon: '□', label: 'База', kind: 'building' },
  barracks: { icon: '▤', label: 'Казарма', kind: 'building' },
  hq: { icon: '▦', label: 'Главная база', kind: 'building' },
  rocketSilo: { icon: '▧', label: 'Ракетная шахта', kind: 'building' },
  depot: { icon: '▥', label: 'Склад', kind: 'building' },
  ruin: { icon: '※', label: 'Руины', kind: 'ruin' },
};

// Экономика «здания — это спайс»: здания дают доход (income) и хранят деньги (storage)
// пропорционально уцелевшим клеткам, принимают груз Сборщика (receivesCargo),
// а разрушенные клетки становятся руинами с обломками.
// Производство — из меню самого здания, как в Dune и Generals: builds — что строит,
// hireUnits — кого выпускает. Каждое здание делает 1 заказ за ход.
export const BUILDINGS = {
  // Главная база — Construction Yard из Dune / Command Center из Generals:
  // строит здания вплотную к базе, выпускает инженеров, даёт доход и хранилище.
  hq: {
    label: UNIT_META.hq.label,
    footprint: { width: 2, height: 2 },
    income: 20,
    storage: 100,
    receivesCargo: true,
    cost: 50,
    builds: ['barracks', 'base', 'depot', 'rocketSilo', 'hq'],
    hireUnits: ['engineer'],
  },
  // Казарма — производит боевые юниты.
  barracks: {
    label: UNIT_META.barracks.label,
    footprint: { width: 2, height: 1 },
    income: 0,
    storage: 10,
    receivesCargo: false,
    cost: 25,
    builds: [],
    hireUnits: ['infantry', 'scout', 'artillery', 'saboteur'],
  },
  rocketSilo: {
    label: UNIT_META.rocketSilo.label,
    footprint: { width: 2, height: 2 },
    income: 0,
    storage: 0,
    receivesCargo: false,
    cost: 40,
    builds: [],
    hireUnits: [],
    // Как супероружие в Generals: место и таймер видны противнику.
    public: true,
  },
  base: {
    label: UNIT_META.base.label,
    footprint: { width: 1, height: 1 },
    income: 5,
    storage: 20,
    receivesCargo: false,
    cost: 15,
    builds: [],
    hireUnits: [],
  },
  // Склад — Refinery + Silo из Dune / Supply Center из Generals: хранилище, приём груза,
  // выпускает Сборщиков и при постройке сразу даёт одного бесплатно.
  depot: {
    label: UNIT_META.depot.label,
    footprint: { width: 1, height: 1 },
    income: 0,
    storage: 60,
    receivesCargo: true,
    cost: 35,
    builds: [],
    hireUnits: ['harvester'],
    freeUnit: 'harvester',
  },
};

export const buildingTypes = Object.keys(BUILDINGS);
export const HIREABLE_UNITS = ['infantry', 'scout', 'engineer', 'harvester', 'artillery', 'saboteur'];
// Здания, которые инженер может строить на поле.
export const BUILDABLE_BUILDINGS = ['hq', 'barracks', 'base', 'depot', 'rocketSilo'];
export const ARTILLERY_RANGE = UNIT_META.artillery.range;
export const ARTILLERY_COOLDOWN_OWN_TURNS = 4;
export const SABOTEUR_STEAL = 15;
// Подлянка: убитая вражеская пехота успевает ответным огнём положить твою — но не всегда.
export const INFANTRY_COUNTER_FIRE_CHANCE = 0.5;

export const ROCKET_LAUNCH_TURNS = 15;
// Ракета 2×2 летит вверх по полю владельца; сбита, когда разрушены 2 её клетки.
export const ROCKET_HITS_TO_DESTROY = 2;
// Шахту можно ставить только в нижних трёх рядах (8–10), иначе ракета вылетит за пару ходов.
export const SILO_MIN_ROW = 7;

export const STARTING_MONEY = 60;
// «Заначка в пенале»: сколько денег можно держать вообще без зданий.
export const POCKET_STORAGE = 20;
// Руины хранят полную стоимость разрушенной клетки здания.
export const SALVAGE_RATE = 1;
export const SELL_REFUND_RATE = 0.5;
// Восстановление клетки инженером: работа + недостающие в руинах материалы.
export const REPAIR_COST_PER_SEGMENT = 5;
export const HARVESTER_CAPACITY = 20;

export const AI_TURN_DELAY_MS = 700;
export const LOG_LIMIT = 40;

export function getBuildingData(type) {
  const building = BUILDINGS[type];

  if (!building) {
    throw new Error(`Unknown building type: ${type}`);
  }

  return building;
}

export function getBuildingFootprint(type) {
  return getBuildingData(type).footprint;
}

export function getSegmentCount(type) {
  const { width, height } = getBuildingFootprint(type);
  return width * height;
}

export function getSegmentStorage(type) {
  return getBuildingData(type).storage / getSegmentCount(type);
}

export function getSegmentIncome(type) {
  return getBuildingData(type).income / getSegmentCount(type);
}

export function getSegmentSalvage(type) {
  return Math.ceil((getBuildingData(type).cost * SALVAGE_RATE) / getSegmentCount(type));
}

export const idToCoord = (id) => {
  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];
  return `${letters[id % GRID_SIZE]}${Math.floor(id / GRID_SIZE) + 1}`;
};

// Клетка одного поля: content — что реально стоит у владельца, seen — что о ней знает противник,
// shot — след вражеского выстрела, который владелец видит на своей карте.
export const makeCell = (id) => ({
  id,
  coords: idToCoord(id),
  x: id % GRID_SIZE,
  y: Math.floor(id / GRID_SIZE),
  content: null,
  seen: { state: 'unknown' },
  shot: null,
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

export const getNeighborIds = (id) => {
  const x = id % GRID_SIZE;
  const y = Math.floor(id / GRID_SIZE);
  return [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y],
  ]
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < GRID_SIZE && ny < GRID_SIZE)
    .map(([nx, ny]) => ny * GRID_SIZE + nx);
};
