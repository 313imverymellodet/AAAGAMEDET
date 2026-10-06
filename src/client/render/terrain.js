// Builds the Shattered Vale: painted ground texture, heightfield, river and static props.
import { LANES, OBSTACLES, SPIRE_POS, FOUNTAIN_POS, CAMPS, BOSSES } from '../../shared/map.js';
import { MAP_HALF } from '../../shared/constants.js';
import { rng } from '../../shared/math.js';
import { mat4, hex } from '../engine/mat.js';

export const MAP_SIZE = 300;

function vnoise(x, z) {
  const s = Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.23 - z * 0.19) * 0.3 + Math.sin(x * 0.05 - z * 0.13) * 0.8;
  return s;
}

// Visual height of the ground (sim is 2D; this only places things vertically).
export function heightAt(x, z) {
  let h = 0;
  const dr = Math.abs(x - z) / Math.SQRT2;
  if (dr < 10) h -= (1 - dr / 10) ** 2 * 0.75;
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (MAP_HALF - 4);
  if (edge > 0) h += edge * 0.85 + Math.max(0, vnoise(x, z)) * edge * 0.35;
  // gentle undulation in the jungle (not on lanes)
  h += vnoise(x * 1.7, z * 1.7) * 0.12;
  return h;
}

function paintCanvas() {
  const S = 1024;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  const k = S / MAP_SIZE;
  const P = (x, z) => [(x + MAP_SIZE / 2) * k, (z + MAP_SIZE / 2) * k];
  const r = rng(99);
  // base grass
  g.fillStyle = '#5d8a3e';
  g.fillRect(0, 0, S, S);
  // blotches
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, rad = 4 + r() * 26;
    const shade = r();
    g.fillStyle = shade < 0.5 ? `rgba(70,110,45,${0.18 + r() * 0.2})` : shade < 0.85 ? `rgba(120,150,70,${0.12 + r() * 0.15})` : `rgba(150,130,80,${0.08 + r() * 0.12})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // jungle darker tint (off-lane)
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgba(160,190,150,1)';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  // outside bounds: rocky highland
  const edge = (MAP_HALF - 4) * k;
  g.strokeStyle = 'rgba(120,110,85,0.9)';
  g.lineWidth = 40;
  g.strokeRect(P(0, 0)[0] - edge - 20, P(0, 0)[1] - edge - 20, edge * 2 + 40, edge * 2 + 40);
  // river bed
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(Math.PI / 4);
  const grd = g.createLinearGradient(0, -12 * k, 0, 12 * k);
  grd.addColorStop(0, 'rgba(120,140,90,0)');
  grd.addColorStop(0.25, 'rgba(176,160,110,0.9)');
  grd.addColorStop(0.5, 'rgba(90,120,110,1)');
  grd.addColorStop(0.75, 'rgba(176,160,110,0.9)');
  grd.addColorStop(1, 'rgba(120,140,90,0)');
  g.fillStyle = grd;
  g.fillRect(-S, -12 * k, S * 2, 24 * k);
  g.restore();
  // lanes
  const lanePath = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pts of Object.values(LANES)) {
    lanePath(pts); g.strokeStyle = 'rgba(80,70,50,0.35)'; g.lineWidth = 12.5 * k; g.stroke();
    lanePath(pts); g.strokeStyle = '#b39a6a'; g.lineWidth = 10 * k; g.stroke();
    lanePath(pts); g.strokeStyle = 'rgba(205,190,150,0.55)'; g.lineWidth = 5 * k; g.stroke();
  }
  // cobble speckle on lanes
  for (const pts of Object.values(LANES)) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += 1.2) {
        const t = s / len;
        const x = ax + (bx - ax) * t + (r() - 0.5) * 8, z = az + (bz - az) * t + (r() - 0.5) * 8;
        const [px, py] = P(x, z);
        g.fillStyle = r() < 0.5 ? 'rgba(140,120,90,0.5)' : 'rgba(215,200,165,0.45)';
        g.fillRect(px, py, 2 + r() * 3, 2 + r() * 3);
      }
    }
  }
  // bases
  [[0, '#7d93b8', '#c9d6ee'], [1, '#b88b7d', '#eed2c9']].forEach(([team, c1, c2]) => {
    const [sx, sz] = SPIRE_POS[team];
    const [px, py] = P(sx, sz);
    const gr = g.createRadialGradient(px, py, 0, px, py, 30 * k);
    gr.addColorStop(0, c2); gr.addColorStop(0.55, c1); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, 30 * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (const rr of [8, 12, 18]) { g.beginPath(); g.arc(px, py, rr * k, 0, Math.PI * 2); g.stroke(); }
    const [fx, fz] = FOUNTAIN_POS[team];
    const [qx, qy] = P(fx, fz);
    g.fillStyle = team ? 'rgba(255,170,140,0.5)' : 'rgba(140,200,255,0.5)';
    g.beginPath(); g.arc(qx, qy, 9 * k, 0, Math.PI * 2); g.fill();
  });
  // camps & boss pits
  for (const cp of [...CAMPS, ...BOSSES]) {
    const [px, py] = P(cp.pos[0], cp.pos[1]);
    const big = cp.type === 'drake' || cp.type === 'warden';
    const rad = (big ? 13 : 6.5) * k;
    const gr = g.createRadialGradient(px, py, 0, px, py, rad);
    gr.addColorStop(0, big ? 'rgba(70,60,70,0.9)' : 'rgba(120,100,70,0.75)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
    if (big) {
      g.strokeStyle = cp.type === 'drake' ? 'rgba(255,140,60,0.5)' : 'rgba(170,120,255,0.5)';
      g.lineWidth = 3; g.beginPath(); g.arc(px, py, 10 * k, 0, Math.PI * 2); g.stroke();
    }
  }
  // obstacle footprints (dirt / moss)
  for (const o of OBSTACLES) {
    const [px, py] = P(o.x, o.z);
    const gr = g.createRadialGradient(px, py, 0, px, py, (o.r + 2.5) * k);
    gr.addColorStop(0, o.kind === 'rock' ? 'rgba(110,100,80,0.7)' : 'rgba(40,70,30,0.7)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, (o.r + 2.5) * k, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function buildTerrainMesh() {
  const N = 150; // grid cells per side
  const half = MAP_SIZE / 2;
  const step = MAP_SIZE / N;
  const verts = (N + 1) * (N + 1);
  const data = new Float32Array(verts * 6);
  const H = (x, z) => heightAt(x, z);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -half + i * step, z = -half + j * step;
      const y = H(x, z);
      const e = 0.5;
      const nx = H(x - e, z) - H(x + e, z), nz = H(x, z - e) - H(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      const o = (j * (N + 1) + i) * 6;
      data[o] = x; data[o + 1] = y; data[o + 2] = z;
      data[o + 3] = nx / l; data[o + 4] = (2 * e) / l; data[o + 5] = nz / l;
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let k = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  return { data, idx };
}

function buildWaterMesh() {
  // a long strip along the x=z diagonal
  const pos = [], idx = [];
  const segs = 40, L = 175, W = 11;
  for (let i = 0; i <= segs; i++) {
    const t = -L + (2 * L * i) / segs;
    const cx = t / Math.SQRT2, cz = t / Math.SQRT2;
    const px = -1 / Math.SQRT2 * W, pz = 1 / Math.SQRT2 * W;
    pos.push(cx + px, -0.28, cz + pz, cx - px, -0.28, cz - pz);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
}

const M = mat4.create();
const C = {
  trunk: hex(0x6b4a2f), leafA: hex(0x3f7a3a), leafB: hex(0x2f6a40), leafC: hex(0x5a8f3a), leafD: hex(0x7aa04a),
  rockA: hex(0x8a8478), rockB: hex(0x6f6a62), rockC: hex(0xa39d90), moss: hex(0x5e7f43),
  grass: hex(0x6f9a45), flowerA: hex(0xf2d24a), flowerB: hex(0xe86a8a), flowerC: hex(0xb08af0),
  stone: hex(0xc9c1b0), stoneDark: hex(0x8d8578), blue: hex(0x4a78d0), red: hex(0xd0564a), gold: hex(0xe9c46a),
  crystalB: hex(0x7fd0ff), crystalR: hex(0xff8f6a),
};

function tree(R, x, z, s, r) {
  const y = Math.min(heightAt(x, z), heightAt(x + 0.8, z), heightAt(x - 0.8, z), heightAt(x, z + 0.8), heightAt(x, z - 0.8)) - 0.15;
  const kind = r();
  if (kind < 0.55) {
    // pine: trunk + 3 stacked cones
    mat4.compose(M, x, y + 0.9 * s, z, 0, 0, 0, 0.45 * s, 1.8 * s, 0.45 * s);
    R.pushStatic('cyl', M, C.trunk, 0, 0.45 * s, 1.8 * s, 0.45 * s);
    const col = r() < 0.5 ? C.leafB : C.leafA;
    for (let i = 0; i < 3; i++) {
      const w = (2.6 - i * 0.6) * s, hgt = (2.2 - i * 0.3) * s;
      mat4.compose(M, x, y + (2.2 + i * 1.25) * s, z, 0, r() * 6, 0, w, hgt, w);
      R.pushStatic('cone', M, col, 0, w, hgt, w);
    }
  } else {
    // broadleaf: trunk + clustered spheres
    mat4.compose(M, x, y + 1.1 * s, z, 0, 0, 0.05, 0.5 * s, 2.2 * s, 0.5 * s);
    R.pushStatic('cyl', M, C.trunk, 0, 0.5 * s, 2.2 * s, 0.5 * s);
    const col = r() < 0.5 ? C.leafC : C.leafD;
    const blobs = 3 + Math.floor(r() * 2);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * 6.28 + r(), d = i ? 0.9 * s : 0;
      const w = (2.4 - (i ? 0.6 : 0)) * s;
      mat4.compose(M, x + Math.cos(a) * d, y + (3.0 + (i ? -0.2 : 0.6)) * s, z + Math.sin(a) * d, 0, 0, 0, w, w * 0.85, w);
      R.pushStatic('sphere', M, col, 0, w, w * 0.85, w);
    }
  }
}

function rockCluster(R, ox, oz, rad, r) {
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = i ? r() * rad * 0.55 : 0;
    const x = ox + Math.cos(a) * d, z = oz + Math.sin(a) * d;
    const s = (i ? 0.55 + r() * 0.35 : 1) * rad * 1.75;
    const hy = s * (0.55 + r() * 0.35);
    const y = heightAt(x, z);
    mat4.compose(M, x, y + hy * 0.25, z, r() * 0.4, r() * 6.28, r() * 0.4, s, hy, s);
    const col = [C.rockA, C.rockB, C.rockC][Math.floor(r() * 3)];
    R.pushStatic(r() < 0.5 ? 'rock' : 'rock2', M, col, 0, s, hy, s);
    if (r() < 0.5) {
      mat4.compose(M, x, y + hy * 0.62, z, 0, r() * 6, 0, s * 0.7, hy * 0.18, s * 0.7);
      R.pushStatic('sphere', M, C.moss, 0, s * 0.7, hy * 0.18, s * 0.7, false);
    }
  }
}

export function buildWorld(R) {
  R.setTerrain(buildTerrainMesh(), paintCanvas(), MAP_SIZE);
  R.setWater(buildWaterMesh());
  R.clearStatic();
  const r = rng(4242);
  // obstacles
  for (const o of OBSTACLES) {
    const rr = rng(o.seed);
    if (o.kind === 'rock') rockCluster(R, o.x, o.z, o.r, rr);
    else {
      const n = Math.max(2, Math.round(o.r * 0.9));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + rr(), d = i ? o.r * (0.35 + rr() * 0.45) : 0;
        tree(R, o.x + Math.cos(a) * d, o.z + Math.sin(a) * d, 0.85 + rr() * 0.5, rr);
      }
    }
  }
  // border forest / cliffs
  const B = MAP_HALF - 2;
  for (let i = 0; i < 420; i++) {
    const side = Math.floor(r() * 4);
    const t = (r() * 2 - 1) * (B + 30);
    const depth = r() * 34;
    let x, z;
    if (side === 0) { x = t; z = -B - depth; } else if (side === 1) { x = t; z = B + depth; } else if (side === 2) { x = -B - depth; z = t; } else { x = B + depth; z = t; }
    if (r() < 0.62) tree(R, x, z, 1.1 + r() * 0.9, r);
    else {
      const s = 3 + r() * 6;
      // sink into the slope so no edge floats
      const y = Math.min(heightAt(x - s * 0.5, z - s * 0.5), heightAt(x + s * 0.5, z + s * 0.5), heightAt(x - s * 0.5, z + s * 0.5), heightAt(x + s * 0.5, z - s * 0.5));
      mat4.compose(M, x, y + s * 0.05, z, r() * 0.4, r() * 6.28, r() * 0.4, s, s * 0.8, s);
      R.pushStatic(r() < 0.5 ? 'rock' : 'rock2', M, r() < 0.5 ? C.rockA : C.rockB, 0, s, s * 0.8, s);
    }
  }
  // grass tufts & flowers away from lanes
  const nearLane = (x, z) => {
    for (const pts of Object.values(LANES)) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const abx = bx - ax, abz = bz - az;
        let t = ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz);
        t = Math.max(0, Math.min(1, t));
        if (Math.hypot(x - (ax + abx * t), z - (az + abz * t)) < 7) return true;
      }
    }
    return false;
  };
  const tuftCount = R.quality === 'low' ? 500 : 1100;
  for (let i = 0; i < tuftCount; i++) {
    const x = (r() * 2 - 1) * (MAP_HALF - 6), z = (r() * 2 - 1) * (MAP_HALF - 6);
    if (nearLane(x, z) || Math.abs(x - z) / Math.SQRT2 < 9) continue;
    if (OBSTACLES.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.5)) continue;
    const y = heightAt(x, z);
    const fl = r();
    if (fl < 0.12) {
      const col = [C.flowerA, C.flowerB, C.flowerC][Math.floor(r() * 3)];
      mat4.compose(M, x, y + 0.35, z, 0, 0, 0, 0.35, 0.35, 0.35);
      R.pushStatic('octa', M, col, 0.25, 0.35, 0.35, 0.35, false);
    } else {
      const s = 0.5 + r() * 0.6;
      mat4.compose(M, x, y + s * 0.4, z, (r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4, s * 0.5, s, s * 0.5);
      R.pushStatic('cone', M, fl < 0.5 ? C.grass : C.leafC, 0, s * 0.5, s, s * 0.5, false);
    }
  }
  // river stones
  for (let i = 0; i < 90; i++) {
    const t = (r() * 2 - 1) * 150;
    const off = (r() < 0.5 ? -1 : 1) * (7.5 + r() * 3);
    const x = t / Math.SQRT2 - off / Math.SQRT2, z = t / Math.SQRT2 + off / Math.SQRT2;
    if (Math.abs(x) > MAP_HALF || Math.abs(z) > MAP_HALF) continue;
    if (nearLane(x, z)) continue;
    const s = 0.6 + r() * 1.4;
    mat4.compose(M, x, heightAt(x, z) + s * 0.15, z, r(), r() * 6, r(), s, s * 0.6, s);
    R.pushStatic('rock2', M, C.rockC, 0, s, s * 0.6, s);
  }
  // lane lanterns
  for (const pts of Object.values(LANES)) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = 14; s < len - 8; s += 26) {
        const t = s / len;
        for (const side of [-1, 1]) {
          const x = ax + (bx - ax) * t + nx * 6.2 * side, z = az + (bz - az) * t + nz * 6.2 * side;
          if (OBSTACLES.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1)) continue;
          const y = heightAt(x, z);
          mat4.compose(M, x, y + 0.9, z, 0, 0, 0, 0.22, 1.8, 0.22);
          R.pushStatic('cyl', M, C.stoneDark, 0, 0.22, 1.8, 0.22);
          mat4.compose(M, x, y + 2.0, z, 0, 0.78, 0, 0.42, 0.42, 0.42);
          R.pushStatic('octa', M, C.gold, 1.4, 0.42, 0.42, 0.42, false);
        }
      }
    }
  }
  // base dressing: pillars ring + fountain
  for (const team of [0, 1]) {
    const [sx, sz] = SPIRE_POS[team];
    const col = team ? C.red : C.blue;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = sx + Math.cos(a) * 24, z = sz + Math.sin(a) * 24;
      if (Math.abs(x) > MAP_HALF - 2 || Math.abs(z) > MAP_HALF - 2) continue;
      if (nearLane(x, z)) continue;
      const y = heightAt(x, z);
      mat4.compose(M, x, y + 2.5, z, 0, a, 0, 1.2, 5, 1.2);
      R.pushStatic('box', M, C.stone, 0, 1.2, 5, 1.2);
      mat4.compose(M, x, y + 5.4, z, 0, a, 0, 1.6, 0.6, 1.6);
      R.pushStatic('box', M, C.stoneDark, 0, 1.6, 0.6, 1.6);
      mat4.compose(M, x, y + 3.2, z, 0, a, 0, 1.25, 2.8, 0.15);
      R.pushStatic('box', M, col, 0.15, 1.25, 2.8, 0.15, false);
    }
    const [fx, fz] = FOUNTAIN_POS[team];
    const fy = heightAt(fx, fz);
    mat4.compose(M, fx, fy + 0.1, fz, 0, 0, 0, 12, 0.24, 12);
    R.pushStatic('cyl', M, C.stone, 0, 12, 0.24, 12);
    mat4.compose(M, fx, fy + 0.2, fz, 0, 0, 0, 8.5, 0.12, 8.5);
    R.pushStatic('cyl', M, team ? hex(0x7a3a30) : hex(0x2f4f7a), 0.25, 8.5, 0.12, 8.5, false);
    // crystals only on the corner side so they never block the view toward the map
    const back = Math.atan2(fz, fx);
    for (let i = 0; i < 5; i++) {
      const a = back + (i / 4 - 0.5) * 1.6;
      const hgt = i === 2 ? 4.2 : 2.6;
      mat4.compose(M, fx + Math.cos(a) * 7.5, fy + hgt * 0.45, fz + Math.sin(a) * 7.5, 0.2 * Math.sin(a), 0, -0.2 * Math.cos(a), 0.8, hgt, 0.8);
      R.pushStatic('octa', M, team ? C.crystalR : C.crystalB, 0.6, 0.8, hgt, 0.8);
    }
  }
}
