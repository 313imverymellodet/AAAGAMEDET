// The Shattered Vale — a compact 3-lane arena, symmetric for both teams.
// Coordinates: x → east, z → south. Dawn (blue) base is south-west, Dusk (red) north-east.
import { BLUE, RED, MAP_HALF } from './constants.js';
import { rng, segDist2, dist2 } from './math.js';

const reflect = ([x, z]) => [-x, -z]; // blue <-> red
const swapLane = ([x, z]) => [-z, -x]; // top <-> bottom (keeps team)

export const SPIRE_POS = [[-98, 98], reflect([-98, 98])];
export const FOUNTAIN_POS = [[-107, 107], reflect([-107, 107])];
export const SHOP_RADIUS = 18;
export const FOUNTAIN_RADIUS = 13;

const topBlue = [[-90, 90], [-100, 72], [-100, -84], [-84, -100], [72, -100], [90, -90]];
export const LANES = {
  top: topBlue,
  mid: [[-90, 90], [-45, 45], [0, 0], [45, -45], [90, -90]],
  bot: topBlue.map(swapLane),
};
export const LANE_NAMES = ['top', 'mid', 'bot'];

// Lane path for a team (red walks it backwards)
export function lanePath(lane, team) {
  const p = LANES[lane];
  return team === BLUE ? p : [...p].reverse();
}

// Towers: tier 1 = outer, 2 = inner, 3 = guardian. Placed slightly off the lane centre.
const blueTowers = [
  { lane: 'top', tier: 1, pos: [-95.5, -15] },
  { lane: 'top', tier: 2, pos: [-95.5, 40] },
  { lane: 'mid', tier: 1, pos: [-25.2, 30.8] },
  { lane: 'mid', tier: 2, pos: [-52.2, 57.8] },
  { lane: 'bot', tier: 1, pos: swapLane([-95.5, -15]) },
  { lane: 'bot', tier: 2, pos: swapLane([-95.5, 40]) },
  { lane: 'base', tier: 3, pos: [-78, 84] },
];
export const TOWERS = [
  ...blueTowers.map((t) => ({ ...t, team: BLUE })),
  // point reflection maps blue's bottom lane onto red's top lane (and vice versa)
  ...blueTowers.map((t) => ({ ...t, team: RED, pos: reflect(t.pos), lane: t.lane === 'top' ? 'bot' : t.lane === 'bot' ? 'top' : t.lane })),
];

// Neutral camps
const blueCamps = [
  { type: 'wolves', pos: [-70, 22] },
  { type: 'golem', pos: [-42, -12] },
  { type: 'raptors', pos: swapLane([-70, 22]) },
  { type: 'golem', pos: swapLane([-42, -12]) },
];
export const CAMPS = [...blueCamps, ...blueCamps.map((c) => ({ ...c, pos: reflect(c.pos) }))];
export const BOSSES = [
  { type: 'warden', pos: [-48, -48] },
  { type: 'drake', pos: [48, 48] },
];

// ---- Obstacles: deterministic rock / tree clusters with 4-fold symmetry ----
function buildObstacles() {
  const r = rng(1337);
  const quarter = [];
  const allLanes = Object.values(LANES);
  const okAt = (x, z, rad) => {
    if (!(x < z - 6 && x + z < -6)) return false; // blue-top quarter only
    if (Math.abs(x) > 94 || Math.abs(z) > 94) return false;
    for (const path of allLanes) {
      for (let i = 0; i < path.length - 1; i++) {
        const d = Math.sqrt(segDist2(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]));
        if (d < 10 + rad) return false;
      }
    }
    if (Math.abs(x - z) / Math.SQRT2 < 7 + rad) return false; // keep river open
    for (const c of [...CAMPS, ...BOSSES]) {
      if (Math.sqrt(dist2(x, z, c.pos[0], c.pos[1])) < (c.type === 'warden' || c.type === 'drake' ? 14 : 10) + rad) return false;
    }
    for (const o of quarter) if (Math.sqrt(dist2(x, z, o.x, o.z)) < rad + o.r + 4.5) return false;
    // keep mirrored copies apart as well
    for (const o of quarter) {
      const [mx, mz] = swapLane([o.x, o.z]);
      if (Math.sqrt(dist2(x, z, mx, mz)) < rad + o.r + 4.5) return false;
    }
    return true;
  };
  let attempts = 0;
  while (quarter.length < 16 && attempts < 6000) {
    attempts++;
    const rad = 2.2 + r() * 3.6;
    const x = -94 + r() * 94;
    const z = -94 + r() * 188;
    if (okAt(x, z, rad)) quarter.push({ x, z, r: rad, kind: r() < 0.55 ? 'rock' : 'grove', seed: Math.floor(r() * 1e6) });
  }
  const out = [];
  for (const o of quarter) {
    const variants = [[o.x, o.z], swapLane([o.x, o.z])];
    for (const v of variants) {
      out.push({ ...o, x: v[0], z: v[1] });
      const rv = reflect(v);
      out.push({ ...o, x: rv[0], z: rv[1] });
    }
  }
  return out.map((o) => ({ x: +o.x.toFixed(2), z: +o.z.toFixed(2), r: +o.r.toFixed(2), kind: o.kind, seed: o.seed }));
}
export const OBSTACLES = buildObstacles();

export const BOUND = MAP_HALF - 6;

// Push a circle (x,z,rad) out of static obstacles + map bounds. Returns [x,z].
export function resolveStatic(x, z, rad, extra) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < OBSTACLES.length; i++) {
      const o = OBSTACLES[i];
      const dx = x - o.x, dz = z - o.z;
      const min = o.r + rad;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        x = o.x + (dx / d) * min;
        z = o.z + (dz / d) * min;
      }
    }
    if (extra) {
      for (let i = 0; i < extra.length; i++) {
        const o = extra[i];
        if (!o.solid) continue;
        const dx = x - o.x, dz = z - o.z;
        const min = o.radius + rad;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.0001;
          x = o.x + (dx / d) * min;
          z = o.z + (dz / d) * min;
        }
      }
    }
  }
  if (x < -BOUND) x = -BOUND; else if (x > BOUND) x = BOUND;
  if (z < -BOUND) z = -BOUND; else if (z > BOUND) z = BOUND;
  return [x, z];
}

// Steering helper: if moving from (x,z) in dir (dx,dz) would hit an obstacle soon,
// rotate the direction to skirt around it. Used by AI-controlled units.
export function steer(x, z, dx, dz, rad, look = 5) {
  let best = null, bestT = Infinity;
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const ox = o.x - x, oz = o.z - z;
    const t = ox * dx + oz * dz;
    if (t <= 0 || t > look + o.r) continue;
    const px = ox - dx * t, pz = oz - dz * t;
    const perp2 = px * px + pz * pz;
    const R = o.r + rad + 0.6;
    if (perp2 < R * R && t < bestT) { bestT = t; best = { o, px, pz }; }
  }
  if (!best) return [dx, dz];
  // steer toward the side the path is already biased to
  const side = (dx * best.pz - dz * best.px) > 0 ? -1 : 1;
  const nx = -dz * side, nz = dx * side;
  const w = 1.2;
  let sx = dx + nx * w, sz = dz + nz * w;
  const l = Math.hypot(sx, sz) || 1;
  return [sx / l, sz / l];
}

export function inRiver(x, z) {
  return Math.abs(x - z) / Math.SQRT2 < 9;
}

// Progress along a lane path (0..length) for the closest point on the path.
export function laneLength(path) {
  let L = 0;
  for (let i = 0; i < path.length - 1; i++) L += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return L;
}
export function laneProgress(path, x, z) {
  let best = Infinity, bestS = 0, acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const abx = bx - ax, abz = bz - az;
    const len = Math.hypot(abx, abz);
    let t = ((x - ax) * abx + (z - az) * abz) / (len * len);
    t = Math.max(0, Math.min(1, t));
    const px = ax + abx * t, pz = az + abz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) { best = d; bestS = acc + len * t; }
    acc += len;
  }
  return { s: bestS, d: Math.sqrt(best) };
}
export function lanePoint(path, s) {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s) {
      const t = (s - acc) / len;
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    acc += len;
  }
  return path[path.length - 1].slice();
}

export const TEAM_SIDE = (team, x, z) => (team === BLUE ? x < z : x > z);
export { BLUE, RED };
