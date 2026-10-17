// Чистый движок правил: каждое действие принимает состояние и возвращает { ok, state, message }.
// Игрок и ИИ ходят через одни и те же функции.
//
// Ход как на скетче: у каждого юнита 1 ОД — шаг или действие. У каждого здания тоже 1 заказ
// за ход (как очередь производства в Dune и Generals): Главная база строит здание или
// выпускает инженера, Казарма — бойца, Склад — Сборщика.
import {
  ARTILLERY_COOLDOWN_OWN_TURNS,
  BUILDINGS,
  GRID_SIZE,
  HARVESTER_CAPACITY,
  INFANTRY_COUNTER_FIRE_CHANCE,
  LOG_LIMIT,
  PLAYERS,
  POCKET_STORAGE,
  REPAIR_COST_PER_SEGMENT,
  ROCKET_HITS_TO_DESTROY,
  ROCKET_LAUNCH_TURNS,
  SABOTEUR_STEAL,
  SELL_REFUND_RATE,
  SILO_MIN_ROW,
  STARTING_MONEY,
  UNIT_META,
  areNeighbors,
  getDistance,
  getEnemy,
  getNeighborIds,
  getSegmentCount,
  getSegmentIncome,
  getSegmentSalvage,
  getSegmentStorage,
  idToCoord,
  makeCell,
} from './gameData.js';

// ---------- Состояние ----------

export const createBoard = () => Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, id) => makeCell(id));

const cloneBoard = (board) => board.map((cell) => ({
  ...cell,
  content: cell.content ? { ...cell.content } : null,
  seen: { ...cell.seen },
}));

// Рабочая копия, которую действие может спокойно мутировать.
const draft = (state) => ({
  ...state,
  boards: { p1: cloneBoard(state.boards.p1), p2: cloneBoard(state.boards.p2) },
  money: { ...state.money },
  rocketProgress: { ...state.rocketProgress },
  actedBuildings: { p1: [...state.actedBuildings.p1], p2: [...state.actedBuildings.p2] },
  rockets: state.rockets.map((rocket) => ({ ...rocket, hits: [...rocket.hits] })),
  log: [...state.log],
});

export const playerLabel = (mode, player) => {
  if (mode === 'ai') return player === 'p1' ? 'Ты' : 'ИИ';
  return player === 'p1' ? 'Игрок 1' : 'Игрок 2';
};

// visibleTo: 'all' — видят оба (выстрелы, шахта, пуск ракеты), иначе только автор (стройка, разведка).
const addLog = (s, player, text, visibleTo = player) => {
  s.logSeq = (s.logSeq ?? 0) + 1;
  s.log = [{ id: s.logSeq, turn: s.turn, player, text, visibleTo }, ...s.log].slice(0, LOG_LIMIT);
};

const ok = (state) => ({ ok: true, state });
const fail = (state, message) => ({ ok: false, state, message });

export const makeUnit = (type, owner, ap = 1) => ({
  kind: 'unit',
  type,
  owner,
  ap,
  cooldown: 0,
  ...(type === 'harvester' ? { cargo: 0 } : {}),
});

// from — какая клетка какого здания тут стояла: по ней инженер может восстановить клетку.
export const makeRuin = (owner, salvage, from = null) => ({ kind: 'ruin', type: 'ruin', owner, salvage, from });

const randomStartCell = () => {
  const row = 5 + Math.floor(Math.random() * (GRID_SIZE - 5));
  const col = Math.floor(Math.random() * GRID_SIZE);
  return row * GRID_SIZE + col;
};

export function createInitialState(mode = 'ai') {
  const boards = { p1: createBoard(), p2: createBoard() };
  PLAYERS.forEach((player) => {
    boards[player][randomStartCell()].content = makeUnit('engineer', player);
  });

  const state = {
    mode,
    turn: 1,
    activePlayer: 'p1',
    boards,
    money: { p1: STARTING_MONEY, p2: STARTING_MONEY },
    rocketProgress: { p1: 0, p2: 0 },
    actedBuildings: { p1: [], p2: [] },
    rockets: [],
    winner: null,
    log: [],
    logSeq: 0,
  };

  addLog(state, 'p1', 'у каждого только инженер. Разверни им Главную базу — дальше всё строится из её меню.', 'all');
  return state;
}

// ---------- Здания и экономика ----------

export function getFootprintIds(originId, type) {
  const x = originId % GRID_SIZE;
  const y = Math.floor(originId / GRID_SIZE);
  const { width, height } = BUILDINGS[type].footprint;

  if (x + width > GRID_SIZE || y + height > GRID_SIZE) return null;

  const ids = [];
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      ids.push((y + dy) * GRID_SIZE + x + dx);
    }
  }
  return ids;
}

export const getSegments = (board, buildingId) => board.filter(
  (cell) => cell.content?.kind === 'building' && cell.content.buildingId === buildingId,
);

const sumBuildingCells = (board, perCell) => board.reduce((total, cell) => (
  cell.content?.kind === 'building' ? total + perCell(cell.content.type) : total
), 0);

// Деньги лежат в зданиях, как спайс в силосах Dune: вместимость = заначка + уцелевшие клетки.
export const getStorageCapacity = (board) => POCKET_STORAGE + Math.floor(sumBuildingCells(board, getSegmentStorage));

// Доход тоже по клеткам: ГБ без одной клетки из четырёх даёт 3/4 дохода.
export const getIncome = (board) => Math.floor(sumBuildingCells(board, getSegmentIncome));

export function addMoneyWithinStorage(money, amount, capacity) {
  const gained = Math.max(0, Math.min(amount, capacity - money));
  return { money: money + gained, gained, lost: amount - gained };
}

export const hasBuilding = (board, type) => board.some((cell) => cell.content?.kind === 'building' && cell.content.type === type);

// В игре, пока есть хоть одна клетка базы/ГБ или инженер, который может отстроиться.
export const isAlive = (board) => board.some((cell) => (
  (cell.content?.kind === 'building' && (cell.content.type === 'hq' || cell.content.type === 'base'))
  || cell.content?.type === 'engineer'
));

export const hasBuildingActed = (state, player, buildingId) => state.actedBuildings[player].includes(buildingId);

// Кто строит: инженер — вплотную к себе (бульдозер Generals),
// Главная база — вплотную к любому своему зданию (Construction Yard из Dune).
export function getPlacementError(board, type, originId, builderId) {
  const ids = getFootprintIds(originId, type);

  if (!ids) return 'выходит за край поля';
  if (ids.some((id) => board[id].content)) return 'клетки заняты';
  if (type === 'rocketSilo' && ids.some((id) => Math.floor(id / GRID_SIZE) < SILO_MIN_ROW)) {
    return `шахту можно ставить только в нижних ${GRID_SIZE - SILO_MIN_ROW} рядах`;
  }

  const builder = board[builderId]?.content;
  if (builder?.type === 'engineer') {
    return ids.some((id) => areNeighbors(builderId, id)) ? null : 'инженер строит только вплотную к себе';
  }
  if (builder?.kind === 'building') {
    const touchesBase = ids.some((id) => getNeighborIds(id).some((n) => board[n].content?.kind === 'building'));
    return touchesBase ? null : 'новое здание должно примыкать к базе';
  }
  return 'нужен строитель: инженер или Главная база';
}

// Клетка, куда юнит выходит из ворот здания: первая свободная соседняя.
export const findExitCell = (board, buildingId) => {
  for (const segment of getSegments(board, buildingId)) {
    const exit = getNeighborIds(segment.id).find((id) => !board[id].content);
    if (exit !== undefined) return exit;
  }
  return null;
};

// Излишек сверх упавшей вместимости высыпается в руины на cellId.
const spillExcess = (s, player, cellId) => {
  const cell = s.boards[player][cellId];
  const excess = Math.max(0, s.money[player] - getStorageCapacity(s.boards[player]));

  if (excess === 0 || (cell.content && cell.content.kind !== 'ruin')) return 0;

  cell.content = cell.content
    ? { ...cell.content, salvage: cell.content.salvage + excess }
    : makeRuin(player, excess);
  s.money[player] -= excess;
  return excess;
};

const isCargoReceiverNear = (board, targetId) => board.some((cell) => (
  cell.content?.kind === 'building'
  && BUILDINGS[cell.content.type].receivesCargo
  && areNeighbors(cell.id, targetId)
));

// Сборщик сам выгружается рядом со своей ГБ или Складом, но только до вместимости.
const unloadHarvesterAt = (s, player, harvesterId) => {
  const board = s.boards[player];
  const harvester = board[harvesterId].content;

  if (harvester?.type !== 'harvester' || !harvester.cargo || !isCargoReceiverNear(board, harvesterId)) {
    return { unloaded: 0, full: false };
  }

  const { money, gained } = addMoneyWithinStorage(s.money[player], harvester.cargo, getStorageCapacity(board));
  s.money[player] = money;
  harvester.cargo -= gained;
  return { unloaded: gained, full: gained === 0 };
};

export const isRepairableRuin = (board, cell) => cell.content?.kind === 'ruin'
  && Boolean(cell.content.from)
  && getSegments(board, cell.content.from.buildingId).length > 0;

export const getRepairCost = (ruin) => REPAIR_COST_PER_SEGMENT
  + Math.max(0, getSegmentSalvage(ruin.from.type) - ruin.salvage);

// Сколько у игрока ещё не потраченных действий: готовые юниты + здания с непустым меню.
export const getReadyCounts = (state, player) => {
  const board = state.boards[player];
  const units = board.filter((cell) => cell.content?.kind === 'unit');
  const readyUnits = units.filter((cell) => cell.content.ap > 0 && !(cell.content.cooldown > 0));
  const producers = [...new Set(board
    .filter((cell) => cell.content?.kind === 'building')
    .filter((cell) => BUILDINGS[cell.content.type].builds.length + BUILDINGS[cell.content.type].hireUnits.length > 0)
    .map((cell) => cell.content.buildingId))];
  const readyProducers = producers.filter((id) => !hasBuildingActed(state, player, id));
  return { ready: readyUnits.length + readyProducers.length, total: units.length + producers.length };
};

// ---------- Ракета ----------

export const rocketCells = (rocket) => rocket.offsets.map((offset, index) => {
  const x = rocket.x + offset.dx;
  const y = rocket.y + offset.dy;
  const onBoard = x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
  return { index, x, y, id: onBoard ? y * GRID_SIZE + x : null, hit: rocket.hits.includes(index) };
});

export const findRocketAt = (rockets, owner, cellId) => rockets.find((rocket) => rocket.owner === owner
  && rocket.status === 'flying'
  && rocketCells(rocket).some((cell) => cell.id === cellId));

const launchRocket = (s, player) => {
  const siloCells = s.boards[player].filter((cell) => cell.content?.kind === 'building' && cell.content.type === 'rocketSilo');
  const originId = siloCells[0].content.originId;
  const ox = originId % GRID_SIZE;
  const oy = Math.floor(originId / GRID_SIZE);
  const fromSilo = siloCells.filter((cell) => cell.content.originId === originId);

  const rocket = {
    rocketId: `${player}-rocket-${s.turn}`,
    owner: player,
    x: ox,
    y: oy,
    offsets: fromSilo.map((cell) => ({ dx: cell.x - ox, dy: cell.y - oy })),
    hits: [],
    status: 'flying',
    launchedTurn: s.turn,
  };
  s.rockets = [...s.rockets, rocket];
  return rocket;
};

// ---------- Выстрел: одно попадание — одна клетка ----------

const truthView = (cell, turn) => {
  const { content } = cell;
  if (!content) return { state: 'empty', turn };
  if (content.kind === 'ruin') return { state: 'ruin', type: content.from?.type, turn };
  return { state: content.kind, type: content.type, turn };
};

const resolveShot = (s, player, targetId) => {
  const foe = getEnemy(player);
  const board = s.boards[foe];
  const cell = board[targetId];
  const { turn } = s;

  const rocket = findRocketAt(s.rockets, foe, targetId);
  if (rocket) {
    const segment = rocketCells(rocket).find((rocketCell) => rocketCell.id === targetId);
    if (segment.hit) return { text: 'по уже подбитой клетке ракеты', result: 'miss' };

    rocket.hits.push(segment.index);
    cell.shot = 'hit';
    const needed = Math.min(ROCKET_HITS_TO_DESTROY, rocket.offsets.length);
    if (rocket.hits.length >= needed) {
      rocket.status = 'destroyed';
      return { text: 'РАКЕТА СБИТА!', result: 'rocket-destroyed' };
    }
    return { text: `попадание по ракете (${rocket.hits.length}/${needed})`, result: 'rocket-hit' };
  }

  const { content } = cell;

  if (!content) {
    cell.seen = { state: 'empty', shot: 'miss', turn };
    cell.shot = 'miss';
    return { text: 'мимо', result: 'miss' };
  }

  cell.shot = 'hit';

  if (content.kind === 'unit') {
    const cargo = content.type === 'harvester' ? content.cargo ?? 0 : 0;
    cell.content = cargo > 0 ? makeRuin(foe, cargo) : null;
    cell.seen = cargo > 0 ? { state: 'ruin', turn } : { state: 'empty', shot: 'kill', turn, type: content.type };
    let text = `убит: ${UNIT_META[content.type].label}`;
    if (cargo > 0) text += `, груз $${cargo} рассыпался`;
    return { text, result: 'kill', killedType: content.type };
  }

  if (content.kind === 'ruin') {
    const scattered = Math.ceil(content.salvage / 2);
    const left = content.salvage - scattered;
    cell.content = left > 0 ? { ...content, salvage: left } : null;
    cell.seen = left > 0 ? { state: 'ruin', type: content.from?.type, turn } : { state: 'empty', shot: 'miss', turn };
    return { text: `по руинам — разлетелось $${scattered} обломков`, result: 'ruin' };
  }

  // Здание: клетка уничтожена целиком, как палуба корабля, и превращается в руины.
  const { buildingId, type, segmentIndex, originId } = content;
  cell.content = makeRuin(foe, getSegmentSalvage(type), { buildingId, type, segmentIndex, originId });
  cell.seen = { state: 'ruin', type, turn };
  const spilled = spillExcess(s, foe, targetId);
  const total = getSegmentCount(type);
  const left = getSegments(board, buildingId).length;
  const label = BUILDINGS[type].label;

  let text = left === 0
    ? `${label} уничтожена полностью!`
    : `попадание! ${label}: снесено ${total - left}/${total}`;
  if (spilled > 0) text += `, из хранилища высыпалось $${spilled}`;
  return { text, result: left === 0 ? 'sunk' : 'hit' };
};

const checkWinner = (s) => {
  if (s.winner) return;
  const alive = { p1: isAlive(s.boards.p1), p2: isAlive(s.boards.p2) };
  if (!alive.p1 && !alive.p2) s.winner = 'draw';
  else if (!alive.p1) s.winner = 'p2';
  else if (!alive.p2) s.winner = 'p1';
};

// ---------- Действия ----------

const getActor = (state, player, unitId, types) => {
  const unit = state.boards[player][unitId]?.content;
  if (unit?.kind !== 'unit' || unit.owner !== player) return { error: 'выбери своего юнита.' };
  if (types && !types.includes(unit.type)) return { error: `${UNIT_META[unit.type].label} так не умеет.` };
  if ((unit.cooldown ?? 0) > 0) return { error: `${UNIT_META[unit.type].label} перезаряжается ещё ${unit.cooldown} х.` };
  if (unit.ap <= 0) return { error: `${UNIT_META[unit.type].label} уже потратил свой ОД в этот ход.` };
  return { unit };
};

// Строитель — готовый инженер или Главная база, у которой в этот ход ещё не было заказа.
const getBuilderError = (state, player, builderId, type) => {
  const builder = state.boards[player][builderId]?.content;
  if (builder?.type === 'engineer') return getActor(state, player, builderId, ['engineer']).error ?? null;
  if (builder?.kind !== 'building' || !BUILDINGS[builder.type].builds.includes(type)) {
    return `${BUILDINGS[type].label}: строит инженер или Главная база.`;
  }
  if (hasBuildingActed(state, player, builder.buildingId)) return `${BUILDINGS[builder.type].label} уже выполнила заказ в этот ход.`;
  return null;
};

const spendBuilder = (s, player, builderId) => {
  const builder = s.boards[player][builderId].content;
  if (builder.kind === 'unit') builder.ap = 0;
  else s.actedBuildings[player].push(builder.buildingId);
};

export function build(state, player, type, originId, builderId) {
  const board = state.boards[player];
  const { cost, label } = BUILDINGS[type];

  const builderError = getBuilderError(state, player, builderId, type);
  if (builderError) return fail(state, builderError);
  if (state.money[player] < cost) return fail(state, `${label} стоит $${cost}.`);
  const error = getPlacementError(board, type, originId, builderId);
  if (error) return fail(state, `${label} сюда не встанет: ${error}.`);

  const s = draft(state);
  const next = s.boards[player];
  const buildingId = `${player}:${type}:${originId}:${s.turn}`;
  const foe = getEnemy(player);
  getFootprintIds(originId, type).forEach((id, segmentIndex) => {
    next[id].content = { kind: 'building', type, owner: player, buildingId, segmentIndex, originId };
    next[id].shot = null;
    // Супероружие видно всем: противник сразу знает, где шахта.
    if (BUILDINGS[type].public) next[id].seen = { state: 'building', type, turn: s.turn };
  });
  spendBuilder(s, player, builderId);
  s.money[player] -= cost;
  addLog(s, player, `стройка: ${label} на ${idToCoord(originId)} (−$${cost}).`);

  if (BUILDINGS[type].public) {
    addLog(s, player, `${label} на ${idToCoord(originId)}! Её место и таймер видны противнику.`, 'all');
  }

  // Склад, как Refinery в Dune и Supply Center в Generals, приходит с бесплатным Сборщиком.
  const { freeUnit } = BUILDINGS[type];
  if (freeUnit) {
    const exit = findExitCell(next, buildingId);
    if (exit !== null) {
      next[exit].content = makeUnit(freeUnit, player, 0);
      addLog(s, player, `${UNIT_META[freeUnit].label} в подарок к зданию: выехал на ${idToCoord(exit)}.`);
    }
  }
  return ok(s);
}

// Производство из меню здания: юнит выходит из ворот на свободную соседнюю клетку
// и действует со следующего хода.
export function produce(state, player, buildingCellId, type) {
  const board = state.boards[player];
  const building = board[buildingCellId]?.content;
  const { cost, label } = UNIT_META[type];

  if (building?.kind !== 'building' || !BUILDINGS[building.type].hireUnits.includes(type)) {
    return fail(state, `${label} так не выпускается.`);
  }
  if (hasBuildingActed(state, player, building.buildingId)) return fail(state, `${BUILDINGS[building.type].label} уже выполнила заказ в этот ход.`);
  if (state.money[player] < cost) return fail(state, `${label} стоит $${cost}.`);
  const exit = findExitCell(board, building.buildingId);
  if (exit === null) return fail(state, `${BUILDINGS[building.type].label}: выход заблокирован, вокруг нет свободной клетки.`);

  const s = draft(state);
  s.boards[player][exit].content = makeUnit(type, player, 0);
  s.money[player] -= cost;
  s.actedBuildings[player].push(building.buildingId);
  addLog(s, player, `${BUILDINGS[building.type].label} выпустила: ${label} на ${idToCoord(exit)} (−$${cost}).`);
  return ok(s);
}

export function move(state, player, fromId, toId) {
  const { unit, error } = getActor(state, player, fromId);
  if (error) return fail(state, error);
  if (!areNeighbors(fromId, toId) || state.boards[player][toId].content) return fail(state, 'ходить можно на 1 пустую соседнюю клетку.');

  const s = draft(state);
  const board = s.boards[player];
  const from = board[fromId];
  board[toId].content = { ...unit, ap: 0 };
  from.content = null;
  // Если противник видел юнита, на его карте остаётся призрак старой позиции.
  if (from.seen.state === 'unit') from.seen = { state: 'ghost', type: unit.type, turn: from.seen.turn };

  let text = `${UNIT_META[unit.type].label}: ${idToCoord(fromId)} → ${idToCoord(toId)}.`;
  const unload = unloadHarvesterAt(s, player, toId);
  if (unload.unloaded > 0) text += ` Выгружено $${unload.unloaded}.`;
  if (unload.full) text += ' Хранилища полны — груз в кузове.';
  addLog(s, player, text);
  return ok(s);
}

// Пехота и артиллерия: выстрел по клетке поля противника в радиусе от своей координаты, можно вслепую.
export function attack(state, player, unitId, targetId) {
  const { unit, error } = getActor(state, player, unitId, ['infantry', 'artillery']);
  if (error) return fail(state, error);
  const meta = UNIT_META[unit.type];
  if (getDistance(unitId, targetId) > meta.range) return fail(state, `${meta.label} достаёт только на ${meta.range} кл. от своей клетки.`);

  const s = draft(state);
  const shot = resolveShot(s, player, targetId);
  const actor = s.boards[player][unitId];
  actor.content.ap = 0;
  if (unit.type === 'artillery') actor.content.cooldown = ARTILLERY_COOLDOWN_OWN_TURNS;

  let text = `${meta.label} → ${idToCoord(targetId)}: ${shot.text}${shot.text.endsWith('!') ? '' : '.'}`;
  // Подлянка: убитая пехота может успеть ответить — повезёт или нет.
  if (unit.type === 'infantry' && shot.killedType === 'infantry') {
    if (Math.random() < INFANTRY_COUNTER_FIRE_CHANCE) {
      actor.content = null;
      text += ' Ответный огонь: наша пехота тоже погибла.';
    } else {
      text += ' Ответный огонь мимо — наша пехота цела.';
    }
  }
  addLog(s, player, text, 'all');
  checkWinner(s);
  return { ok: true, state: s, shot };
}

export function scout(state, player, unitId, targetId) {
  const { error } = getActor(state, player, unitId, ['scout']);
  if (error) return fail(state, error);
  const { range, label } = UNIT_META.scout;
  if (getDistance(unitId, targetId) > range) return fail(state, `${label} видит только на ${range} кл.`);

  const s = draft(state);
  const foe = getEnemy(player);
  const cell = s.boards[foe][targetId];
  cell.seen = truthView(cell, s.turn);
  s.boards[player][unitId].content.ap = 0;

  const seen = cell.seen;
  const found = seen.state === 'empty'
    ? 'пусто'
    : seen.state === 'ruin' ? 'руины' : UNIT_META[seen.type].label;
  addLog(s, player, `разведка ${idToCoord(targetId)}: ${found}.`);
  return ok(s);
}

export function sabotage(state, player, unitId, targetId) {
  const { error } = getActor(state, player, unitId, ['saboteur']);
  if (error) return fail(state, error);
  const { range, label } = UNIT_META.saboteur;
  if (getDistance(unitId, targetId) > range) return fail(state, `${label} проникает только в соседнюю клетку.`);

  const s = draft(state);
  const foe = getEnemy(player);
  const cell = s.boards[foe][targetId];
  cell.seen = truthView(cell, s.turn);
  s.boards[player][unitId].content.ap = 0;

  if (cell.content?.kind !== 'building') {
    addLog(s, player, `${label} пробрался в ${idToCoord(targetId)}: красть нечего.`);
    return ok(s);
  }

  const stolen = Math.min(SABOTEUR_STEAL, s.money[foe]);
  const { money, lost } = addMoneyWithinStorage(s.money[player], stolen, getStorageCapacity(s.boards[player]));
  s.money[foe] -= stolen;
  s.money[player] = money;
  // Жертва замечает вора: на её карте он виден, пока не уйдёт.
  s.boards[player][unitId].seen = { state: 'unit', type: 'saboteur', turn: s.turn };

  let text = `${label} вскрыл хранилище (${BUILDINGS[cell.content.type].label}) на ${idToCoord(targetId)}: украдено $${stolen}.`;
  if (lost > 0) text += ` $${lost} не влезло в хранилища.`;
  addLog(s, player, text, 'all');
  return ok(s);
}

export function harvest(state, player, harvesterId, ruinId) {
  const { unit, error } = getActor(state, player, harvesterId, ['harvester']);
  if (error) return fail(state, error);
  const ruin = state.boards[player][ruinId]?.content;
  if (ruin?.kind !== 'ruin' || !areNeighbors(harvesterId, ruinId)) return fail(state, 'Сборщик грузит только соседние руины.');
  const space = HARVESTER_CAPACITY - (unit.cargo ?? 0);
  if (space <= 0) return fail(state, 'кузов полон: вези груз к ГБ или Складу.');

  const s = draft(state);
  const board = s.boards[player];
  const taken = Math.min(space, ruin.salvage);
  const left = ruin.salvage - taken;
  board[ruinId].content = left > 0 ? { ...ruin, salvage: left } : null;
  if (left === 0) board[ruinId].shot = null;
  board[harvesterId].content = { ...unit, ap: 0, cargo: (unit.cargo ?? 0) + taken };

  let text = `Сборщик погрузил $${taken} на ${idToCoord(ruinId)}${left > 0 ? ` (осталось $${left})` : ' — руины расчищены'}.`;
  const unload = unloadHarvesterAt(s, player, harvesterId);
  if (unload.unloaded > 0) text += ` Сразу выгружено $${unload.unloaded}.`;
  addLog(s, player, text);
  return ok(s);
}

export function unload(state, player, harvesterId) {
  const harvester = state.boards[player][harvesterId]?.content;
  if (harvester?.type !== 'harvester') return fail(state, 'выбери Сборщика.');

  const s = draft(state);
  const result = unloadHarvesterAt(s, player, harvesterId);
  if (result.unloaded === 0) {
    return fail(state, result.full
      ? 'хранилища полны: построй Склад или потрать деньги.'
      : 'выгрузка — только рядом со своей ГБ или Складом и с грузом в кузове.');
  }
  addLog(s, player, `Сборщик выгрузил $${result.unloaded}.`);
  return ok(s);
}

// Продажа здания, как в C&C: 50% цены уцелевших клеток. Разбирает инженер вплотную.
export function dismantle(state, player, engineerId, targetId) {
  const { error } = getActor(state, player, engineerId, ['engineer']);
  if (error) return fail(state, error);
  const target = state.boards[player][targetId]?.content;
  if (target?.kind !== 'building' || !areNeighbors(engineerId, targetId)) return fail(state, 'разобрать можно только своё здание рядом с инженером.');

  const s = draft(state);
  const board = s.boards[player];
  const segments = getSegments(board, target.buildingId);
  const cellCost = BUILDINGS[target.type].cost / getSegmentCount(target.type);
  const refund = Math.floor(segments.length * cellCost * SELL_REFUND_RATE);

  segments.forEach((cell) => {
    board[cell.id].content = null;
  });
  board[engineerId].content.ap = 0;
  s.money[player] += refund;
  // Что не влезло в оставшиеся хранилища — остаётся кучей на месте здания.
  const spilled = spillExcess(s, player, targetId);

  let text = `разобрано: ${BUILDINGS[target.type].label}, возврат $${refund}.`;
  if (spilled > 0) text += ` Не влезло $${spilled} — лежат руинами на ${idToCoord(targetId)}.`;
  addLog(s, player, text);
  return ok(s);
}

// Инженер восстанавливает снесённую клетку стоящего здания из её же руин.
export function repair(state, player, engineerId, ruinId) {
  const { error } = getActor(state, player, engineerId, ['engineer']);
  if (error) return fail(state, error);
  const board = state.boards[player];
  const cell = board[ruinId];
  if (!areNeighbors(engineerId, ruinId) || !isRepairableRuin(board, cell)) {
    return fail(state, 'восстановить можно руины своего ещё стоящего здания рядом с инженером.');
  }
  const ruin = cell.content;
  const cost = getRepairCost(ruin);
  if (state.money[player] < cost) return fail(state, `восстановление клетки стоит $${cost}.`);

  const s = draft(state);
  const next = s.boards[player];
  const { from } = ruin;
  const surplus = Math.max(0, ruin.salvage - getSegmentSalvage(from.type));
  next[ruinId].content = {
    kind: 'building',
    type: from.type,
    owner: player,
    buildingId: from.buildingId,
    segmentIndex: from.segmentIndex,
    originId: from.originId,
  };
  next[ruinId].shot = null;
  next[engineerId].content.ap = 0;
  s.money[player] -= cost;
  s.money[player] = addMoneyWithinStorage(s.money[player], surplus, getStorageCapacity(next)).money;

  addLog(s, player, `восстановлена клетка: ${BUILDINGS[from.type].label} на ${idToCoord(ruinId)} (−$${cost}).`);
  return ok(s);
}

// ---------- Ход ----------

const startTurn = (s, player) => {
  const board = s.boards[player];
  s.activePlayer = player;
  s.actedBuildings[player] = [];

  board.forEach((cell) => {
    if (cell.content?.kind !== 'unit') return;
    const cooldown = Math.max((cell.content.cooldown ?? 0) - 1, 0);
    cell.content.cooldown = cooldown;
    cell.content.ap = cooldown > 0 ? 0 : 1;
  });

  // Ракета владельца поднимается на 1 клетку; вышла за верхний край — победа.
  s.rockets.forEach((rocket) => {
    if (rocket.owner !== player || rocket.status !== 'flying') return;
    rocket.y -= 1;
    if (rocketCells(rocket).every((cell) => cell.y < 0)) {
      rocket.status = 'escaped';
      s.winner = player;
      addLog(s, player, 'ядерная ракета ушла за край карты. Конец игры!', 'all');
    }
  });

  // Таймер шахты, как у супероружия Generals: пропадает вместе с шахтой.
  if (hasBuilding(board, 'rocketSilo')) {
    s.rocketProgress[player] = Math.min(s.rocketProgress[player] + 1, ROCKET_LAUNCH_TURNS);
    const flying = s.rockets.some((rocket) => rocket.owner === player && rocket.status === 'flying');
    if (s.rocketProgress[player] >= ROCKET_LAUNCH_TURNS && !flying) {
      const rocket = launchRocket(s, player);
      s.rocketProgress[player] = 0;
      addLog(s, player, `ПУСК ЯДЕРНОЙ РАКЕТЫ с ${idToCoord(rocket.y * GRID_SIZE + rocket.x)}! Сбейте её, пока не ушла за край.`, 'all');
    }
  } else {
    s.rocketProgress[player] = 0;
  }

  const income = getIncome(board);
  const capacity = getStorageCapacity(board);
  const { money, gained, lost } = addMoneyWithinStorage(s.money[player], income, capacity);
  s.money[player] = money;

  let unloaded = 0;
  board.forEach((cell) => {
    if (cell.content?.type === 'harvester') unloaded += unloadHarvesterAt(s, player, cell.id).unloaded;
  });

  const parts = [];
  if (income > 0) parts.push(`доход +$${gained}`);
  if (lost > 0) parts.push(`$${lost} сгорело — хранилища полны (${capacity})`);
  if (unloaded > 0) parts.push(`Сборщики выгрузили $${unloaded}`);
  if (parts.length > 0) addLog(s, player, `${parts.join('; ')}.`);
};

export function endTurn(state) {
  if (state.winner) return state;
  const s = draft(state);
  const next = getEnemy(s.activePlayer);
  if (s.activePlayer === 'p2') s.turn += 1;
  startTurn(s, next);
  checkWinner(s);
  return s;
}
