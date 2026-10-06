// Hierarchical part rig built from instanced primitives.
import { mat4 } from '../engine/mat.js';

const TMP = mat4.create();

export class Rig {
  constructor() {
    this.parts = [];
    this.j = {}; // named joints
    this.m = {}; // named meshes
    this.world = [];
  }
  // pure transform node
  joint(name, parent, pos, rot = [0, 0, 0]) {
    const p = { name, parent: parent == null ? -1 : this.idx(parent), geom: null, pos: [...pos], rot: [...rot], pos0: [...pos], rot0: [...rot], scale: [1, 1, 1] };
    this.parts.push(p);
    this.world.push(mat4.create());
    if (name) this.j[name] = p;
    return p;
  }
  mesh(parent, geom, pos, rot, scale, color, opts = {}) {
    const p = {
      name: opts.name, parent: parent == null ? -1 : this.idx(parent), geom, pos: [...pos], rot: [...(rot || [0, 0, 0])],
      pos0: [...pos], rot0: [...(rot || [0, 0, 0])], scale: [...scale], scale0: [...scale], color, emissive: opts.e || 0,
      outline: opts.outline !== false, alpha: opts.alpha ?? 1, hidden: false, glow: !!opts.glow,
    };
    this.parts.push(p);
    this.world.push(null);
    if (opts.name) this.m[opts.name] = p;
    return p;
  }
  idx(parent) {
    if (typeof parent === 'number') return parent;
    if (typeof parent === 'string') return this.parts.indexOf(this.j[parent]);
    return this.parts.indexOf(parent);
  }
  reset() {
    for (const p of this.parts) {
      p.pos[0] = p.pos0[0]; p.pos[1] = p.pos0[1]; p.pos[2] = p.pos0[2];
      p.rot[0] = p.rot0[0]; p.rot[1] = p.rot0[1]; p.rot[2] = p.rot0[2];
      if (p.scale0) { p.scale[0] = p.scale0[0]; p.scale[1] = p.scale0[1]; p.scale[2] = p.scale0[2]; }
    }
  }
  // root: world matrix for the whole model. style: { alpha, flash, tint, emissiveBoost }
  draw(R, root, style) {
    const parts = this.parts, world = this.world;
    const alphaMul = style.alpha ?? 1;
    const flash = style.flash || 0;
    const tint = style.tint;
    const tintAmt = style.tintAmt || 0;
    const eb = style.emissiveBoost || 0;
    const col = [0, 0, 0];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const parentM = p.parent < 0 ? root : world[p.parent];
      if (!p.geom) {
        mat4.compose(TMP, p.pos[0], p.pos[1], p.pos[2], p.rot[0], p.rot[1], p.rot[2], 1, 1, 1);
        mat4.multiply(world[i], parentM, TMP);
        continue;
      }
      if (p.hidden) continue;
      mat4.compose(TMP, p.pos[0], p.pos[1], p.pos[2], p.rot[0], p.rot[1], p.rot[2], p.scale[0], p.scale[1], p.scale[2]);
      const M = DRAW;
      mat4.multiply(M, parentM, TMP);
      let r = p.color[0], g = p.color[1], b = p.color[2];
      if (tintAmt > 0) { r += (tint[0] - r) * tintAmt; g += (tint[1] - g) * tintAmt; b += (tint[2] - b) * tintAmt; }
      if (flash > 0) { r += (1 - r) * flash; g += (1 - g) * flash; b += (1 - b) * flash; }
      col[0] = r; col[1] = g; col[2] = b;
      const a = p.alpha * alphaMul;
      R.push(p.geom, M, col, a, p.emissive + flash * 0.6 + (p.glow ? eb : 0), p.scale[0], p.scale[1], p.scale[2], p.outline && a > 0.99);
    }
  }
  worldPos(part, out = [0, 0, 0]) {
    const i = this.parts.indexOf(part);
    const m = this.world[i] || DRAW;
    out[0] = m[12]; out[1] = m[13]; out[2] = m[14];
    return out;
  }
}
const DRAW = mat4.create();

// Humanoid base: returns rig with joints hips, torso, head, shL/shR, elL/elR, haL/haR, lgL/lgR, knL/knR
export function humanoid(o) {
  const r = new Rig();
  const s = o.build || 1; // width multiplier
  const h = o.height || 1;
  const skin = o.skin, cloth = o.cloth, cloth2 = o.cloth2 || cloth, boots = o.boots || o.dark;
  r.joint('root', null, [0, 0, 0]);
  r.joint('hips', 'root', [0, 1.02 * h, 0]);
  r.mesh('hips', 'box', [0, 0, 0], null, [0.62 * s, 0.32, 0.38 * s], cloth2);
  r.joint('torso', 'hips', [0, 0.12, 0]);
  r.mesh('torso', 'box', [0, 0.36 * h, 0], null, [0.74 * s, 0.62 * h, 0.44 * s], cloth, { name: 'chest' });
  r.mesh('torso', 'box', [0, 0.04, 0], null, [0.66 * s, 0.14, 0.42 * s], o.belt || o.dark);
  r.joint('neck', 'torso', [0, 0.72 * h, 0]);
  r.joint('head', 'neck', [0, 0.06, 0]);
  r.mesh('head', 'sphere', [0, 0.28, 0], null, [0.5, 0.55, 0.5], skin, { name: 'headMesh' });
  if (o.eyes !== false) {
    const ec = o.eyeColor || [0.08, 0.08, 0.1];
    const ee = o.eyeGlow || 0;
    r.mesh('head', 'sphere', [0.1, 0.31, 0.22], null, [0.07, 0.09, 0.05], ec, { e: ee, outline: false });
    r.mesh('head', 'sphere', [-0.1, 0.31, 0.22], null, [0.07, 0.09, 0.05], ec, { e: ee, outline: false });
  }
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    r.joint('sh' + side, 'torso', [0.47 * s * sx, 0.6 * h, 0], [0, 0, 0.12 * sx]);
    r.mesh('sh' + side, 'limb', [0, 0.05, 0], null, [0.24 * s, 0.44 * h, 0.24 * s], o.sleeve || cloth);
    r.joint('el' + side, 'sh' + side, [0, -0.42 * h, 0]);
    r.mesh('el' + side, 'limb', [0, 0, 0], null, [0.2 * s, 0.4 * h, 0.2 * s], o.forearm || skin);
    r.joint('ha' + side, 'el' + side, [0, -0.42 * h, 0]);
    r.mesh('ha' + side, 'sphere', [0, -0.04, 0], null, [0.17, 0.17, 0.17], o.glove || skin);
    r.joint('lg' + side, 'hips', [0.19 * s * sx, -0.08, 0]);
    r.mesh('lg' + side, 'limb', [0, 0, 0], null, [0.28 * s, 0.5 * h, 0.28 * s], o.pants || cloth2);
    r.joint('kn' + side, 'lg' + side, [0, -0.5 * h, 0]);
    r.mesh('kn' + side, 'limb', [0, 0, 0], null, [0.23 * s, 0.46 * h, 0.23 * s], boots);
    r.mesh('kn' + side, 'box', [0, -0.46 * h, 0.07], null, [0.22 * s, 0.12, 0.34], boots);
  }
  return r;
}
