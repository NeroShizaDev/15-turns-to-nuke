export const PLAYERS = ['blue', 'red'];

export const BUILDINGS = {
  hq: {
    label: 'HQ',
    footprint: { width: 2, height: 2 },
    income: 2,
    hireUnits: ['engineer', 'scout'],
  },
  rocketSilo: {
    label: 'Rocket silo',
    footprint: { width: 2, height: 2 },
    income: 0,
    hireUnits: [],
  },
  base: {
    label: 'Forward base',
    footprint: { width: 1, height: 1 },
    income: 1,
    hireUnits: ['infantry'],
  },
};

export const UNITS = {
  infantry: { label: 'Infantry', cost: 2 },
  engineer: { label: 'Engineer', cost: 3 },
  scout: { label: 'Scout', cost: 2 },
};

export const buildingTypes = Object.keys(BUILDINGS);

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
