// ИИ-противник. Ходит через те же действия, что и игрок, и смотрит на поле игрока
// только через seen — то, что сам разведал или по чему уже стрелял. Без подглядывания.
import {
  BUILDINGS,
  GRID_SIZE,
  HARVESTER_CAPACITY,
  UNIT_META,
  getDistance,
  getEnemy,
  getNeighborIds,
} from './gameData.js';
import {
  attack,
  build,
  getPlacementError,
  getRepairCost,
  getStorageCapacity,
  harvest,
  hasBuildingActed,
  isRepairableRuin,
  move,
  produce,
  repair,
  rocketCells,
  sabotage,
  scout,
} from './rules.js';

// Через столько ходов «пусто» снова считается неизвестным: соперник мог там отстроиться.
const STALE_TURNS = 5;

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const pickBest = (items, score) => items.reduce((best, item) => {
  const value = score(item);
  return value > best.value ? { item, value } : best;
}, { item: null, value: -Infinity });

// Оценка клеток поля игрока по знаниям ИИ: добивание вокруг попаданий, затем шахматная охота.
const scoreFoeCells = (s, player) => {
  const foe = getEnemy(player);
  const board = s.boards[foe];
  const scores = new Map();

  board.forEach((cell) => {
    const { seen } = cell;
    let score = 0;

    if (seen.state === 'building') {
      score = 60 + (seen.type === 'rocketSilo' ? 25 : 0) + (seen.type === 'hq' ? 15 : 0);
    } else if (seen.state === 'unit') {
      score = s.turn - seen.turn <= 1 ? 40 + (seen.type === 'artillery' ? 10 : 0) : 15;
    } else if (seen.state === 'ghost') {
      score = 8;
    } else if (seen.state === 'empty' && s.turn - seen.turn >= STALE_TURNS) {
      score = 3;
    } else if (seen.state === 'unknown') {
      const nearHit = getNeighborIds(cell.id).some((id) => ['ruin', 'building'].includes(board[id].seen.state));
      score = nearHit ? 30 : 4 + ((cell.x + cell.y) % 2 === 0 ? 2 : 0);
    }

    scores.set(cell.id, score);
  });

  // Пущенная ракета видна всем и важнее всего.
  s.rockets
    .filter((rocket) => rocket.owner === foe && rocket.status === 'flying')
    .forEach((rocket) => rocketCells(rocket).forEach((cell) => {
      if (cell.id !== null && !cell.hit) scores.set(cell.id, 100);
    }));

  return scores;
};

const cellsInRange = (originId, range) => {
  const ids = [];
  for (let id = 0; id < GRID_SIZE * GRID_SIZE; id += 1) {
    if (getDistance(originId, id) <= range) ids.push(id);
  }
  return ids;
};

// Первый шаг кратчайшего пути по пустым клеткам своего поля к любой клетке, где isGoal(id) === true.
const stepToward = (board, fromId, isGoal) => {
  const queue = [fromId];
  const firstStep = new Map([[fromId, null]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current !== fromId && isGoal(current)) return firstStep.get(current);

    getNeighborIds(current).forEach((next) => {
      if (firstStep.has(next) || board[next].content) return;
      firstStep.set(next, current === fromId ? next : firstStep.get(current));
      queue.push(next);
    });
  }

  return null;
};

export function runAiTurn(initialState, player = 'p2') {
  let s = initialState;
  const foe = getEnemy(player);

  const tryAction = (result) => {
    if (result.ok) s = result.state;
    return result.ok;
  };
  const board = () => s.boards[player];
  const unitsOf = (type) => board().filter((cell) => cell.content?.kind === 'unit' && cell.content.type === type);
  const buildingsOf = (type) => {
    const firstCells = new Map();
    board().forEach((cell) => {
      if (cell.content?.kind === 'building' && cell.content.type === type && !firstCells.has(cell.content.buildingId)) {
        firstCells.set(cell.content.buildingId, cell);
      }
    });
    return [...firstCells.values()];
  };
  const countBuilding = (type) => buildingsOf(type).length;
  const isReady = (cell) => cell.content?.kind === 'unit' && cell.content.ap > 0 && (cell.content.cooldown ?? 0) === 0;
  const readyUnits = (type) => unitsOf(type).filter(isReady);
  const buildingFree = (cell) => !hasBuildingActed(s, player, cell.content.buildingId);

  // ---------- Экономика: стройка через ГБ (Construction Yard) или инженера ----------
  const wantedBuildings = () => {
    const money = s.money[player];
    const wants = [];
    if (countBuilding('hq') === 0) wants.push('hq');
    if (countBuilding('barracks') === 0) wants.push('barracks');
    if (countBuilding('base') < 2) wants.push('base');
    if (countBuilding('rocketSilo') === 0 && s.turn >= 4) wants.push('rocketSilo');
    if (countBuilding('depot') === 0 && s.turn >= 3) wants.push('depot');
    if (money >= getStorageCapacity(board()) - 10 && countBuilding('depot') < 2) wants.push('depot');
    if (countBuilding('base') < 4 && money >= 45) wants.push('base');
    return wants;
  };

  const tryBuild = (type, builderId) => {
    const origins = shuffle(board().map((cell) => cell.id))
      .filter((id) => getPlacementError(board(), type, id, builderId) === null);
    // Чуть разносим здания, чтобы одно попадание не открывало всю базу.
    const { item: origin } = pickBest(origins, (id) => -board()
      .filter((cell) => cell.content?.kind === 'building' && getDistance(cell.id, id) <= 1).length);
    return origin !== null && tryAction(build(s, player, type, origin, builderId));
  };

  const builders = () => [
    ...buildingsOf('hq').filter(buildingFree).map((cell) => cell.id),
    ...readyUnits('engineer').map((cell) => cell.id),
  ];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const type = wantedBuildings()[0];
    if (!type || s.money[player] < BUILDINGS[type].cost) break;
    const built = builders().some((builderId) => tryBuild(type, builderId));
    if (!built) break;
  }

  // ---------- Экономика: производство из зданий ----------
  const ruinCount = () => board().filter((cell) => cell.content?.kind === 'ruin').length;
  const hasRuins = () => ruinCount() > 0;
  // Когда хранилища почти полны, деньги всё равно сгорят — лучше выпустить армию побольше.
  const rich = () => s.money[player] >= getStorageCapacity(board()) * 0.6;
  const wantedUnits = [
    ['engineer', () => unitsOf('engineer').length === 0],
    ['artillery', () => unitsOf('artillery').length < (rich() ? 4 : 2)],
    ['scout', () => unitsOf('scout').length < (rich() ? 2 : 1)],
    ['harvester', () => hasRuins() && unitsOf('harvester').length < (ruinCount() > 4 ? 2 : 1)],
    ['infantry', () => unitsOf('infantry').length < (rich() ? 4 : 2)],
    ['saboteur', () => unitsOf('saboteur').length === 0 && s.money[player] >= 40],
  ];

  board()
    .filter((cell, index, cells) => cell.content?.kind === 'building'
      && cells.findIndex((other) => other.content?.buildingId === cell.content.buildingId) === index)
    .forEach((cell) => {
      if (!buildingFree(cell)) return;
      const menu = BUILDINGS[cell.content.type].hireUnits;
      const choice = wantedUnits.find(([type, wanted]) => menu.includes(type) && wanted() && s.money[player] >= UNIT_META[type].cost);
      if (choice) tryAction(produce(s, player, cell.id, choice[0]));
    });

  // ---------- Логистика: ремонт и Сборщики ----------
  readyUnits('engineer').forEach((cell) => {
    const ruin = getNeighborIds(cell.id)
      .map((id) => board()[id])
      .find((neighbor) => isRepairableRuin(board(), neighbor) && getRepairCost(neighbor.content) <= s.money[player]);
    if (ruin) tryAction(repair(s, player, cell.id, ruin.id));
  });

  readyUnits('harvester').forEach((cell) => {
    const harvester = cell.content;
    const ruinNear = getNeighborIds(cell.id).find((id) => board()[id].content?.kind === 'ruin');
    if (ruinNear !== undefined && harvester.cargo < HARVESTER_CAPACITY) {
      tryAction(harvest(s, player, cell.id, ruinNear));
      return;
    }

    const wantsRuins = harvester.cargo < HARVESTER_CAPACITY && hasRuins();
    const step = stepToward(board(), cell.id, (id) => getNeighborIds(id).some((n) => {
      const content = board()[n].content;
      if (wantsRuins) return content?.kind === 'ruin';
      return content?.kind === 'building' && BUILDINGS[content.type].receivesCargo;
    }));
    if (step !== null) tryAction(move(s, player, cell.id, step));
  });

  // ---------- Бой ----------
  const bestTarget = (unitId, range, filter = () => true) => {
    const scores = scoreFoeCells(s, player);
    return pickBest(shuffle(cellsInRange(unitId, range)).filter(filter), (id) => scores.get(id) ?? 0);
  };
  const isUnknown = (id) => {
    const { seen } = s.boards[foe][id];
    return seen.state === 'unknown' || (seen.state === 'empty' && s.turn - seen.turn >= STALE_TURNS);
  };

  // Разведчики первыми: вскрывают клетки вокруг попаданий или по шахматке.
  readyUnits('scout').forEach((cell) => {
    const { item, value } = bestTarget(cell.id, UNIT_META.scout.range, isUnknown);
    if (item !== null && value > 0) tryAction(scout(s, player, cell.id, item));
  });

  readyUnits('artillery').forEach((cell) => {
    const { item, value } = bestTarget(cell.id, UNIT_META.artillery.range);
    const blindShot = value > 0 && Math.random() < 0.5;
    if (item !== null && (value >= 30 || blindShot)) tryAction(attack(s, player, cell.id, item));
  });

  readyUnits('saboteur').forEach((cell) => {
    const { item, value } = bestTarget(cell.id, UNIT_META.saboteur.range);
    const known = item !== null && s.boards[foe][item].seen.state === 'building';
    if (known || (item !== null && value > 0 && Math.random() < 0.3)) tryAction(sabotage(s, player, cell.id, item));
  });

  readyUnits('infantry').forEach((cell) => {
    // Пехоту на пехоту не бросаем: половина шансов потерять свою на ответном огне.
    const { item, value } = bestTarget(
      cell.id,
      UNIT_META.infantry.range,
      (id) => s.boards[foe][id].seen.type !== 'infantry',
    );
    const blindShot = value > 0 && Math.random() < 0.35;
    if (item !== null && (value >= 30 || blindShot)) tryAction(attack(s, player, cell.id, item));
  });

  // ---------- Манёвр: подводим бойцов так, чтобы цель попала в радиус ----------
  const scores = scoreFoeCells(s, player);
  const hotTargets = [...scores.entries()].filter(([, value]) => value >= 30).map(([id]) => id);
  // Без известных целей идём туда, где в радиусе больше всего неразведанных клеток.
  const densestUnknown = (range) => {
    const { item } = pickBest(shuffle(cellsInRange(0, GRID_SIZE * 2)), (id) => cellsInRange(id, range).filter(isUnknown).length);
    return item;
  };

  ['artillery', 'infantry', 'scout', 'saboteur'].forEach((type) => {
    readyUnits(type).forEach((cell) => {
      const { range } = UNIT_META[type];
      if (hotTargets.some((goal) => getDistance(cell.id, goal) <= range)) return;
      const reach = (goals) => stepToward(board(), cell.id, (id) => goals.some((goal) => getDistance(id, goal) <= range));
      // Если к известным целям не пройти (свои руины и здания мешают), идём разведывать.
      const step = (hotTargets.length > 0 ? reach(hotTargets) : null) ?? reach([densestUnknown(range)]);
      if (step !== null) tryAction(move(s, player, cell.id, step));
    });
  });

  // Инженер иногда отходит в сторону, чтобы база не сбивалась в одну кучу.
  readyUnits('engineer').forEach((cell) => {
    if (Math.random() > 0.4) return;
    const free = getNeighborIds(cell.id).filter((id) => !board()[id].content);
    if (free.length > 0) tryAction(move(s, player, cell.id, shuffle(free)[0]));
  });

  return s;
}
