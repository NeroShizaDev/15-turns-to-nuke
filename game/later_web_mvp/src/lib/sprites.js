// Миниатюры, нарисованные ручкой в тетради (оригиналы — assets/МОБЫ И ПОЛЕ).
// Здания 2×2 и 2×1 нарисованы целиком и режутся по клеткам при отрисовке.
import artillery from '../assets/sprites/artillery.png';
import barracks from '../assets/sprites/barracks.png';
import base from '../assets/sprites/base.png';
import engineer from '../assets/sprites/engineer.png';
import hq from '../assets/sprites/hq.png';
import infantry from '../assets/sprites/infantry.png';
import missed from '../assets/sprites/missed.png';
import rocketSilo from '../assets/sprites/rocketSilo.png';
import saboteur from '../assets/sprites/saboteur.png';
import scout from '../assets/sprites/scout.png';

export const SPRITES = {
  artillery,
  barracks,
  base,
  engineer,
  hq,
  infantry,
  rocketSilo,
  saboteur,
  scout,
};

// «Обстрелянная ранее пустая клетка»: сюда уже стреляли, было пусто — но поле живое.
export const MISSED_SPRITE = missed;
