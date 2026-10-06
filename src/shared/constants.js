// Core tuning constants shared by server, client and bots.
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // online: 15 Hz snapshots

export const BLUE = 0;
export const RED = 1;
export const TEAM_NAMES = ['Dawn', 'Dusk'];

export const MAP_HALF = 118;

export const MAX_LEVEL = 15;
export const ULT_LEVEL = 3;
export const RESPAWN_BASE = 6;
export const RESPAWN_PER_LEVEL = 1.6;

export const PASSIVE_GOLD = 3; // per second
export const START_GOLD = 500;
export const FIRST_WAVE = 12;
export const WAVE_INTERVAL = 26;
export const SURGE_TIME = 12 * 60; // "Siege Surge": empowered minions so matches end on time

export const XP_RANGE = 18;
export const RECALL_TIME = 4;
export const DODGE_CD = 6;
export const DODGE_DIST = 6.5;
export const DODGE_TIME = 0.2;

export const HERO_RADIUS = 0.8;

// Entity kinds (network ids)
export const K = {
  HERO: 0,
  MELEE: 1,
  CASTER: 2,
  SIEGE: 3,
  WRAITH: 4,
  WOLF: 5,
  GOLEM: 6,
  RAPTOR: 7,
  WARDEN: 8,
  DRAKE: 9,
  TOWER: 10,
  SPIRE: 11,
};

// Status flags (bitfield sent over the wire)
export const F = {
  DEAD: 1,
  STUN: 2,
  SLOW: 4,
  ROOT: 8,
  SHIELD: 16,
  STEALTH: 32,
  RECALL: 64,
  AIRBORNE: 128,
  DASH: 256,
  INVULN: 512,
  EMPOWER: 1024,
  BURN: 2048,
  CHILL: 4096,
  HASTE: 8192,
  RAGE: 16384,
  CHANNEL: 32768,
};

export const XP_TABLE = (() => {
  const t = [0];
  let total = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    total += 160 + 90 * (l - 1);
    t.push(total);
  }
  return t; // t[level-1] = xp needed to reach level
})();
