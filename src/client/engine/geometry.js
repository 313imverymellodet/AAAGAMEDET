// Procedural unit primitives. Every model in the game is assembled from these,
// which lets the renderer draw the whole scene with one instanced call per primitive.

function finish(pos, nor, idx) {
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
}

// Convert indexed geometry to flat-shaded (unique vertices per triangle)
function flatten(g, orient = true) {
  const pos = [], nor = [], idx = [];
  let mx = 0, my = 0, mz = 0;
  const nv = g.pos.length / 3;
  for (let i = 0; i < g.pos.length; i += 3) { mx += g.pos[i] / nv; my += g.pos[i + 1] / nv; mz += g.pos[i + 2] / nv; }
  for (let i = 0; i < g.idx.length; i += 3) {
    let a = g.idx[i] * 3, b = g.idx[i + 1] * 3, c = g.idx[i + 2] * 3;
    if (orient) {
      const ux0 = g.pos[b] - g.pos[a], uy0 = g.pos[b + 1] - g.pos[a + 1], uz0 = g.pos[b + 2] - g.pos[a + 2];
      const vx0 = g.pos[c] - g.pos[a], vy0 = g.pos[c + 1] - g.pos[a + 1], vz0 = g.pos[c + 2] - g.pos[a + 2];
      const n0x = uy0 * vz0 - uz0 * vy0, n0y = uz0 * vx0 - ux0 * vz0, n0z = ux0 * vy0 - uy0 * vx0;
      const fx = (g.pos[a] + g.pos[b] + g.pos[c]) / 3 - mx, fy = (g.pos[a + 1] + g.pos[b + 1] + g.pos[c + 1]) / 3 - my, fz = (g.pos[a + 2] + g.pos[b + 2] + g.pos[c + 2]) / 3 - mz;
      if (n0x * fx + n0y * fy + n0z * fz < 0) { const tmp = b; b = c; c = tmp; }
    }
    const ax = g.pos[a], ay = g.pos[a + 1], az = g.pos[a + 2];
    const bx = g.pos[b], by = g.pos[b + 1], bz = g.pos[b + 2];
    const cx = g.pos[c], cy = g.pos[c + 1], cz = g.pos[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = pos.length / 3;
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    idx.push(base, base + 1, base + 2);
  }
  return finish(pos, nor, idx);
}

export function box() {
  const pos = [], nor = [], idx = [];
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  for (const [n, u, v] of faces) {
    const b = pos.length / 3;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(0.5 * (n[0] + u[0] * su + v[0] * sv), 0.5 * (n[1] + u[1] * su + v[1] * sv), 0.5 * (n[2] + u[2] * su + v[2] * sv));
      nor.push(...n);
    }
    // ensure CCW winding facing outward
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2];
    if (dot > 0) idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  return finish(pos, nor, idx);
}

export function sphere(seg = 14, rings = 10) {
  const pos = [], nor = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings, phi = v * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const u = s / seg, th = u * Math.PI * 2;
      const x = Math.sin(phi) * Math.sin(th), y = Math.cos(phi), z = Math.sin(phi) * Math.cos(th);
      pos.push(x * 0.5, y * 0.5, z * 0.5);
      nor.push(x, y, z);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return finish(pos, nor, idx);
}

// Frustum along Y. y0..y1 with radii r0 (at y0) and r1 (at y1).
function frustum(seg, y0, y1, r0, r1, caps = true) {
  const pos = [], nor = [], idx = [];
  const slope = (r0 - r1) / (y1 - y0);
  for (let s = 0; s <= seg; s++) {
    const th = (s / seg) * Math.PI * 2;
    const sx = Math.sin(th), sz = Math.cos(th);
    const nl = Math.hypot(1, slope);
    pos.push(sx * r0, y0, sz * r0, sx * r1, y1, sz * r1);
    nor.push(sx / nl, slope / nl, sz / nl, sx / nl, slope / nl, sz / nl);
  }
  for (let s = 0; s < seg; s++) {
    const a = s * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  if (caps) {
    for (const [y, r, ny] of [[y0, r0, -1], [y1, r1, 1]]) {
      if (r <= 0.0001) continue;
      const c = pos.length / 3;
      pos.push(0, y, 0); nor.push(0, ny, 0);
      for (let s = 0; s <= seg; s++) {
        const th = (s / seg) * Math.PI * 2;
        pos.push(Math.sin(th) * r, y, Math.cos(th) * r); nor.push(0, ny, 0);
      }
      for (let s = 0; s < seg; s++) {
        if (ny > 0) idx.push(c, c + 1 + s, c + 2 + s);
        else idx.push(c, c + 2 + s, c + 1 + s);
      }
    }
  }
  return finish(pos, nor, idx);
}

export const cylinder = () => frustum(14, -0.5, 0.5, 0.5, 0.5);
export const cone = () => frustum(14, -0.5, 0.5, 0.5, 0.0);
// Limb: pivot at the top (y=0) hanging down to y=-1, slightly tapered.
export const limb = () => frustum(10, -1, 0, 0.4, 0.5);

export function icosahedron(detail = 0, jitter = 0, seed = 1) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  verts = verts.map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
  for (let d = 0; d < detail; d++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (cache.has(k)) return cache.get(k);
      const v = verts[a].map((c, i) => (c + verts[b][i]) / 2);
      const l = Math.hypot(...v);
      verts.push(v.map((c) => c / l));
      cache.set(k, verts.length - 1);
      return verts.length - 1;
    };
    const nf = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nf;
  }
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pos = [], idx = [];
  for (const v of verts) {
    const k = 0.5 * (1 + (rnd() - 0.5) * jitter);
    pos.push(v[0] * k, v[1] * k, v[2] * k);
  }
  for (const f of faces) idx.push(f[0], f[1], f[2]);
  return flatten({ pos, idx });
}

export function octahedron() {
  const v = [[0.5, 0, 0], [-0.5, 0, 0], [0, 0.5, 0], [0, -0.5, 0], [0, 0, 0.5], [0, 0, -0.5]];
  const f = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  const pos = v.flat(), idx = f.flat();
  return flatten({ pos, idx });
}

export function torus(seg = 28, tube = 6, r = 0.08) {
  const pos = [], nor = [], idx = [];
  const R = 0.5;
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    for (let j = 0; j <= tube; j++) {
      const v = (j / tube) * Math.PI * 2;
      const cx = Math.cos(u), cz = Math.sin(u);
      const x = (R + r * Math.cos(v)) * cx, y = r * Math.sin(v), z = (R + r * Math.cos(v)) * cz;
      pos.push(x, y, z);
      nor.push(Math.cos(v) * cx, Math.sin(v), Math.cos(v) * cz);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * (tube + 1) + j, b = a + tube + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return finish(pos, nor, idx);
}

// Blade: flat diamond-section prism from y=0 (hilt) to y=1 (tip)
export function blade() {
  const pos = [
    0, 1, 0, // tip 0
    -0.5, 0.82, 0, 0.5, 0.82, 0, // shoulder 1,2
    -0.5, 0, 0, 0.5, 0, 0, // base 3,4
    0, 0.82, 0.12, 0, 0.82, -0.12, // spine 5,6
    0, 0, 0.12, 0, 0, -0.12, // spine base 7,8
  ];
  const idx = [
    0, 1, 5, 0, 5, 2, 0, 2, 6, 0, 6, 1,
    1, 3, 7, 1, 7, 5, 5, 7, 4, 5, 4, 2,
    2, 4, 8, 2, 8, 6, 6, 8, 3, 6, 3, 1,
  ];
  return flatten({ pos, idx });
}

// Flat quad in XZ, facing +Y
export function quad() {
  return finish([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 2, 1, 0, 3, 2]);
}

// Crescent slash arc in XZ (double sided), centred on +Z, spanning ±80°
export function arc(seg = 16) {
  const pos = [], nor = [], idx = [];
  for (let side = 0; side < 2; side++) {
    const ny = side ? -1 : 1;
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const a = (t - 0.5) * (Math.PI * 0.9);
      const w = Math.sin(t * Math.PI); // thickest in the middle
      const ri = 1 - 0.28 * w, ro = 1;
      pos.push(Math.sin(a) * ri, 0, Math.cos(a) * ri, Math.sin(a) * ro, 0, Math.cos(a) * ro);
      nor.push(0, ny, 0, 0, ny, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      if (side) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return finish(pos, nor, idx);
}

export function rock(seed) {
  return icosahedron(1, 0.35, seed);
}
