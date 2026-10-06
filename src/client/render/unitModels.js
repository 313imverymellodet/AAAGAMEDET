// Minions, summons, jungle monsters, bosses and structures.
import { Rig } from './rig.js';
import { hex } from '../engine/mat.js';
import { K } from '../../shared/constants.js';

const PI = Math.PI;
const TEAM = [
  { main: hex(0x4a7fd6), light: hex(0x9fd0ff), dark: hex(0x24406e), glow: hex(0x7fd8ff) },
  { main: hex(0xd6584a), light: hex(0xffb09f), dark: hex(0x6e2a24), glow: hex(0xff9a6a) },
];
const steel = hex(0xc0c8d2), wood = hex(0x7a5534), stone = hex(0xb9b2a2), stoneDark = hex(0x7e776a), black = hex(0x1b1b22);

function meleeMinion(team) {
  const c = TEAM[team];
  const r = new Rig();
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 0.62, 0]);
  r.mesh('body', 'box', [0, 0.2, 0], null, [0.62, 0.62, 0.48], c.main);
  r.mesh('body', 'sphere', [0, 0.72, 0], null, [0.52, 0.5, 0.52], steel);
  r.mesh('body', 'box', [0, 0.7, 0.22], null, [0.32, 0.06, 0.1], c.glow, { e: 1.2, outline: false });
  r.mesh('body', 'cone', [0, 1.05, 0], null, [0.12, 0.3, 0.12], c.light);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    r.joint('lg' + s, 'body', [0.16 * sx, -0.1, 0]);
    r.mesh('lg' + s, 'limb', [0, 0, 0], null, [0.2, 0.5, 0.2], c.dark);
  }
  r.joint('arm', 'body', [-0.38, 0.35, 0]);
  r.mesh('arm', 'limb', [0, 0, 0], null, [0.17, 0.4, 0.17], c.dark);
  r.joint('wpn', 'arm', [0, -0.4, 0.05]);
  r.mesh('wpn', 'blade', [0, 0, 0.05], [PI / 2, 0, 0], [0.13, 0.75, 1], steel);
  r.mesh('body', 'box', [0.38, 0.2, 0.12], null, [0.08, 0.6, 0.5], c.light);
  return r;
}

function casterMinion(team) {
  const c = TEAM[team];
  const r = new Rig();
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 0.1, 0]);
  r.mesh('body', 'cone', [0, 0.5, 0], null, [0.75, 1.05, 0.75], c.main);
  r.mesh('body', 'sphere', [0, 1.15, 0], null, [0.44, 0.44, 0.44], hex(0xe8c8a8));
  r.mesh('body', 'cone', [0, 1.55, -0.05], [-0.2, 0, 0], [0.5, 0.6, 0.5], c.dark);
  r.mesh('body', 'sphere', [0.08, 1.18, 0.19], null, [0.07, 0.07, 0.05], c.glow, { e: 2, outline: false });
  r.mesh('body', 'sphere', [-0.08, 1.18, 0.19], null, [0.07, 0.07, 0.05], c.glow, { e: 2, outline: false });
  r.joint('arm', 'body', [-0.3, 0.9, 0.1]);
  r.mesh('arm', 'cyl', [0, 0.1, 0.1], null, [0.06, 1.3, 0.06], wood);
  r.mesh('arm', 'gem', [0, 0.82, 0.1], null, [0.22, 0.22, 0.22], c.glow, { e: 2, name: 'tip', glow: true });
  return r;
}

function siegeMinion(team) {
  const c = TEAM[team];
  const r = new Rig();
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 0.55, 0]);
  r.mesh('body', 'box', [0, 0.15, 0], null, [1.2, 0.55, 1.5], wood);
  r.mesh('body', 'box', [0, 0.48, 0], null, [1.1, 0.12, 1.4], c.main);
  r.joint('arm', 'body', [0, 0.7, 0.05], [-0.25, 0, 0]);
  r.mesh('arm', 'cyl', [0, 0, 0.45], [PI / 2, 0, 0], [0.42, 1.3, 0.42], hex(0x555c66));
  r.mesh('arm', 'torus', [0, 0, 1.08], [PI / 2, 0, 0], [0.56, 0.56, 0.56], c.light);
  r.mesh('arm', 'sphere', [0, 0, 1.12], null, [0.3, 0.3, 0.1], c.glow, { e: 1.5, outline: false, name: 'tip', glow: true });
  for (const [x, z] of [[0.68, 0.5], [-0.68, 0.5], [0.68, -0.5], [-0.68, -0.5]]) {
    r.joint(null, 'body', [x, -0.15, z]);
    r.mesh(r.parts.length - 1, 'cyl', [0, 0, 0], [0, 0, PI / 2], [0.55, 0.16, 0.55], hex(0x4a3420), { name: 'wheel' });
  }
  r.mesh('body', 'octa', [0, 0.85, -0.5], null, [0.3, 0.45, 0.3], c.glow, { e: 1.5 });
  return r;
}

function wraith(team) {
  const r = new Rig();
  const g = hex(0x6dffb5);
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 0.6, 0]);
  r.mesh('body', 'cone', [0, 0.25, 0], [PI, 0, 0], [0.7, 1.2, 0.7], hex(0x2f6a50), { e: 0.6, alpha: 0.8 });
  r.mesh('body', 'sphere', [0, 1.0, 0], null, [0.5, 0.55, 0.5], hex(0xbfe8d0), { e: 0.3 });
  r.mesh('body', 'sphere', [0.1, 1.02, 0.2], null, [0.09, 0.1, 0.05], g, { e: 3, outline: false });
  r.mesh('body', 'sphere', [-0.1, 1.02, 0.2], null, [0.09, 0.1, 0.05], g, { e: 3, outline: false });
  r.joint('arm', 'body', [0, 0.75, 0]);
  for (const sx of [1, -1]) r.mesh('arm', 'cone', [0.38 * sx, -0.1, 0.25], [1.2, 0, 0.4 * sx], [0.15, 0.6, 0.15], hex(0xbfe8d0));
  void team;
  return r;
}

function wolf(small) {
  const r = new Rig();
  const fur = small ? hex(0x7a7f88) : hex(0x5a5f6a), fur2 = hex(0xc9ccd2);
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 0.85, 0]);
  r.mesh('body', 'box', [0, 0, 0], null, [0.7, 0.7, 1.5], fur);
  r.mesh('body', 'box', [0, 0.25, 0.4], null, [0.8, 0.5, 0.7], fur2);
  r.joint('head', 'body', [0, 0.35, 0.8]);
  r.mesh('head', 'box', [0, 0, 0.2], null, [0.55, 0.5, 0.55], fur);
  r.mesh('head', 'box', [0, -0.08, 0.55], null, [0.32, 0.26, 0.45], fur2);
  for (const sx of [1, -1]) {
    r.mesh('head', 'cone', [0.18 * sx, 0.35, 0.1], null, [0.16, 0.32, 0.12], fur);
    r.mesh('head', 'sphere', [0.15 * sx, 0.1, 0.46], null, [0.08, 0.08, 0.06], hex(0xffd23a), { e: 2, outline: false });
  }
  r.joint('arm', 'head', [0, 0, 0]);
  r.mesh('body', 'cone', [0, 0.15, -0.95], [-2.0, 0, 0], [0.22, 0.7, 0.22], fur);
  for (const [n, x, z] of [['lgL', 0.25, 0.5], ['lgR', -0.25, 0.5], ['bkL', 0.25, -0.5], ['bkR', -0.25, -0.5]]) {
    r.joint(n, 'body', [x, -0.2, z]);
    r.mesh(n, 'limb', [0, 0, 0], null, [0.2, 0.68, 0.2], fur);
  }
  return r;
}

function golem() {
  const r = new Rig();
  const rock = hex(0x8a8070), moss = hex(0x5e7f43), glow = hex(0xffb347);
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 1.6, 0]);
  r.mesh('body', 'rock', [0, 0, 0], null, [2.1, 1.8, 1.6], rock);
  r.mesh('body', 'sphere', [0, 0.75, 0], null, [1.4, 0.4, 1.1], moss, { outline: false });
  r.mesh('body', 'gem', [0, 0.1, 0.72], null, [0.4, 0.4, 0.3], glow, { e: 2, glow: true });
  r.joint('head', 'body', [0, 1.0, 0.35]);
  r.mesh('head', 'rock2', [0, 0.15, 0], null, [0.8, 0.65, 0.75], rock);
  for (const sx of [1, -1]) r.mesh('head', 'sphere', [0.18 * sx, 0.18, 0.36], null, [0.12, 0.08, 0.06], glow, { e: 3, outline: false });
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    r.joint('sh' + s, 'body', [1.15 * sx, 0.45, 0]);
    r.mesh('sh' + s, 'rock', [0, -0.5, 0], null, [0.75, 1.2, 0.75], rock);
    r.mesh('sh' + s, 'rock2', [0, -1.25, 0.1], null, [0.85, 0.75, 0.85], stoneDark);
    r.joint('lg' + s, 'body', [0.5 * sx, -0.8, 0]);
    r.mesh('lg' + s, 'limb', [0, 0, 0], null, [0.6, 0.8, 0.6], rock);
  }
  r.joint('arm', 'shR', [0, 0, 0]);
  return r;
}

function raptor(small) {
  const r = new Rig();
  const c1 = small ? hex(0xd8833a) : hex(0xc2502a), c2 = hex(0xf2d27a);
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 0.95, 0]);
  r.mesh('body', 'sphere', [0, 0, 0], null, [0.8, 0.75, 1.1], c1);
  r.mesh('body', 'cone', [0, 0.05, -0.75], [-1.9, 0, 0], [0.4, 0.8, 0.4], c1);
  r.mesh('body', 'cone', [0, 0.4, -0.1], [-0.4, 0, 0], [0.12, 0.5, 0.5], c2);
  r.joint('head', 'body', [0, 0.45, 0.5]);
  r.mesh('head', 'limb', [0, 0.45, 0], [-0.5, 0, 0], [0.26, 0.55, 0.26], c1);
  r.mesh('head', 'sphere', [0, 0.55, 0.22], null, [0.38, 0.32, 0.45], c1);
  r.mesh('head', 'cone', [0, 0.5, 0.55], [PI / 2, 0, 0], [0.18, 0.4, 0.14], c2);
  for (const sx of [1, -1]) r.mesh('head', 'sphere', [0.14 * sx, 0.62, 0.32], null, [0.07, 0.07, 0.05], hex(0x101010), { outline: false });
  r.joint('arm', 'head', [0, 0, 0]);
  for (const [n, sx] of [['lgL', 1], ['lgR', -1]]) {
    r.joint(n, 'body', [0.25 * sx, -0.25, 0.05]);
    r.mesh(n, 'limb', [0, 0, 0], null, [0.2, 0.75, 0.2], c2);
  }
  return r;
}

function drake() {
  const r = new Rig();
  const scale1 = hex(0xc0392b), belly = hex(0xffa040), horn = hex(0xf0e6c8), wing = hex(0x8e2a20);
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 2.2, 0]);
  r.mesh('body', 'sphere', [0, 0, 0], null, [2.6, 2.1, 3.6], scale1);
  r.mesh('body', 'sphere', [0, -0.45, 0.3], null, [2.0, 1.4, 3.0], belly, { e: 0.5, glow: true });
  for (let i = 0; i < 5; i++) r.mesh('body', 'cone', [0, 1.05 - i * 0.05, 1.0 - i * 0.6], [-0.4, 0, 0], [0.3, 0.6, 0.3], horn);
  r.joint('head', 'body', [0, 0.9, 1.8]);
  r.mesh('head', 'limb', [0, 1.2, 0], [-0.6, 0, 0], [0.9, 1.4, 0.9], scale1);
  r.mesh('head', 'box', [0, 1.4, 0.8], null, [1.1, 0.8, 1.5], scale1);
  r.mesh('head', 'box', [0, 1.15, 1.45], null, [0.8, 0.35, 0.8], belly);
  for (const sx of [1, -1]) {
    r.mesh('head', 'cone', [0.35 * sx, 1.95, 0.4], [-0.9, 0, 0.3 * sx], [0.2, 0.9, 0.2], horn);
    r.mesh('head', 'sphere', [0.42 * sx, 1.55, 1.25], null, [0.18, 0.14, 0.12], hex(0xffee80), { e: 3, outline: false });
  }
  r.joint('arm', 'head', [0, 1.2, 1.6]);
  for (const [n, sx] of [['wingL', 1], ['wingR', -1]]) {
    r.joint(n, 'body', [1.0 * sx, 0.8, 0.2], [0, 0, 0]);
    r.mesh(n, 'blade', [1.6 * sx, 0, 0], [0, 0, -PI / 2 * sx], [2.4, 3.2, 1], wing);
  }
  r.joint('tail', 'body', [0, 0, -1.6]);
  r.mesh('tail', 'cone', [0, 0, -1.6], [-PI / 2, 0, 0], [0.9, 3.2, 0.9], scale1);
  for (const [n, x, z] of [['lgL', 0.9, 0.9], ['lgR', -0.9, 0.9], ['bkL', 0.9, -0.9], ['bkR', -0.9, -0.9]]) {
    r.joint(n, 'body', [x, -0.7, z]);
    r.mesh(n, 'limb', [0, 0, 0], null, [0.55, 1.5, 0.55], scale1);
  }
  return r;
}

function warden() {
  const r = new Rig();
  const rock = hex(0x6f6a7e), rock2 = hex(0x4e4a5c), core = hex(0xb07aff), moss = hex(0x4f6f43);
  r.joint('root', null, [0, 0, 0]);
  r.joint('body', 'root', [0, 3.2, 0]);
  r.mesh('body', 'rock', [0, 0, 0], null, [3.6, 3.2, 2.6], rock);
  r.mesh('body', 'gem', [0, 0.2, 1.15], null, [0.9, 0.9, 0.7], core, { e: 2.5, name: 'core', glow: true });
  r.mesh('body', 'sphere', [0, 1.4, -0.2], null, [2.6, 0.6, 2.0], moss, { outline: false });
  r.joint('head', 'body', [0, 1.9, 0.6]);
  r.mesh('head', 'rock2', [0, 0.3, 0], null, [1.4, 1.1, 1.3], rock2);
  for (const sx of [1, -1]) {
    r.mesh('head', 'cone', [0.7 * sx, 1.0, -0.2], [-0.5, 0, -0.6 * sx], [0.35, 1.6, 0.35], hex(0xd8d0c0));
    r.mesh('head', 'sphere', [0.3 * sx, 0.35, 0.6], null, [0.2, 0.12, 0.1], core, { e: 3, outline: false });
  }
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    r.joint('sh' + s, 'body', [2.0 * sx, 0.9, 0]);
    r.mesh('sh' + s, 'rock', [0, -1.0, 0], null, [1.2, 2.2, 1.2], rock);
    r.mesh('sh' + s, 'rock2', [0, -2.4, 0.2], null, [1.6, 1.4, 1.6], rock2);
    r.mesh('sh' + s, 'octa', [0, 0.4, 0], null, [0.6, 1.2, 0.6], core, { e: 1.5 });
    r.joint('lg' + s, 'body', [0.9 * sx, -1.4, 0]);
    r.mesh('lg' + s, 'limb', [0, 0, 0], null, [1.0, 1.8, 1.0], rock2);
  }
  r.joint('arm', 'shR', [0, 0, 0]);
  return r;
}

function tower(team) {
  const c = TEAM[team];
  const r = new Rig();
  r.joint('root', null, [0, 0, 0]);
  r.mesh('root', 'cyl', [0, 0.6, 0], null, [4.2, 1.2, 4.2], stoneDark, { name: 'base' });
  r.mesh('root', 'cyl', [0, 1.4, 0], null, [3.4, 0.6, 3.4], stone);
  r.mesh('root', 'cyl', [0, 4.2, 0], null, [2.2, 5.4, 2.2], stone, { name: 'column' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    r.mesh('root', 'box', [Math.cos(a) * 1.15, 4.2, Math.sin(a) * 1.15], [0, -a, 0], [0.3, 5.2, 0.5], stoneDark);
  }
  r.mesh('root', 'cyl', [0, 7.1, 0], null, [3.2, 0.5, 3.2], stoneDark, { name: 'cap' });
  r.mesh('root', 'box', [0, 5.2, 1.11], null, [0.9, 1.6, 0.05], c.main, { e: 0.2 });
  r.joint('crystal', 'root', [0, 9.0, 0]);
  r.mesh('crystal', 'octa', [0, 0, 0], null, [1.3, 2.4, 1.3], c.main, { e: 0.9, name: 'gem', glow: true });
  r.mesh('crystal', 'ring', [0, 0, 0], [PI / 2, 0, 0], [2.6, 2.6, 2.6], c.glow, { e: 0.7, outline: false, name: 'ring' });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    r.mesh('root', 'octa', [Math.cos(a) * 1.5, 7.9, Math.sin(a) * 1.5], [0, 0, 0.3], [0.4, 0.9, 0.4], c.light, { e: 0.8 });
  }
  return r;
}

function spire(team) {
  const c = TEAM[team];
  const r = new Rig();
  r.joint('root', null, [0, 0, 0]);
  r.mesh('root', 'cyl', [0, 0.5, 0], null, [9, 1, 9], stoneDark);
  r.mesh('root', 'cyl', [0, 1.3, 0], null, [7, 0.7, 7], stone);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    r.mesh('root', 'octa', [Math.cos(a) * 2.8, 3.2, Math.sin(a) * 2.8], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], [1.0, 4.0, 1.0], c.main, { e: 0.5 });
  }
  r.joint('crystal', 'root', [0, 8, 0]);
  r.mesh('crystal', 'octa', [0, 0, 0], null, [3.2, 7.5, 3.2], c.main, { e: 1.0, name: 'gem', glow: true });
  r.joint('rings', 'root', [0, 8, 0]);
  r.mesh('rings', 'ring', [0, 0, 0], [PI / 2, 0, 0], [6.5, 6.5, 6.5], c.light, { e: 1.5, outline: false, name: 'ringA' });
  r.mesh('rings', 'ring', [0, 0, 0], [PI / 2 + 0.6, 0, 0], [5.4, 5.4, 5.4], c.light, { e: 1.5, outline: false, name: 'ringB' });
  return r;
}

export function buildUnitModel(kind, team, variant) {
  switch (kind) {
    case K.MELEE: return { rig: meleeMinion(team), style: 'minion', scale: 1 };
    case K.CASTER: return { rig: casterMinion(team), style: 'caster', scale: 1 };
    case K.SIEGE: return { rig: siegeMinion(team), style: 'siege', scale: 1 };
    case K.WRAITH: return { rig: wraith(team), style: 'wraith', scale: 1 };
    case K.WOLF: return { rig: wolf(variant), style: 'quad', scale: variant ? 0.75 : 1.15 };
    case K.GOLEM: return { rig: golem(), style: 'golem', scale: 1 };
    case K.RAPTOR: return { rig: raptor(variant), style: 'biped', scale: variant ? 0.7 : 1.1 };
    case K.DRAKE: return { rig: drake(), style: 'drake', scale: 1.05 };
    case K.WARDEN: return { rig: warden(), style: 'golem', scale: 1.15 };
    case K.TOWER: return { rig: tower(team), style: 'tower', scale: 1 };
    case K.SPIRE: return { rig: spire(team), style: 'spire', scale: 1 };
  }
  return { rig: meleeMinion(team), style: 'minion', scale: 1 };
}

// st: { t, speed, phase, atk (0..1|-1), dead (0..1|-1) }
export function animateUnit(model, st) {
  const r = model.rig, J = r.j;
  r.reset();
  const t = st.t, sp = st.speed, ph = st.phase;
  const a = st.atk;
  const swing = a >= 0 ? (a < 0.5 ? a / 0.5 : 1 - (a - 0.5) / 0.5) : 0;
  switch (model.style) {
    case 'minion':
      J.body.pos[1] += Math.abs(Math.sin(ph)) * 0.08 * sp;
      J.lgL.rot[0] = Math.sin(ph) * 0.8 * sp; J.lgR.rot[0] = -Math.sin(ph) * 0.8 * sp;
      J.arm.rot[0] = -0.4 - swing * 1.8 + Math.sin(ph) * 0.3 * sp;
      break;
    case 'caster':
      J.body.pos[1] += Math.sin(t * 3 + ph) * 0.05 + Math.abs(Math.sin(ph)) * 0.06 * sp;
      J.body.rot[2] = Math.sin(ph) * 0.06 * sp;
      J.arm.rot[0] = -swing * 1.2;
      break;
    case 'siege':
      for (const p of r.parts) if (p.name === 'wheel') p.rot[0] = ph * 1.6;
      J.arm.rot[0] = -0.25 + swing * 0.25;
      J.body.pos[1] += Math.sin(t * 20) * 0.02 * sp;
      break;
    case 'wraith':
      J.body.pos[1] += Math.sin(t * 3 + ph) * 0.18;
      J.arm.rot[0] = -swing * 1.2;
      break;
    case 'quad':
      J.body.pos[1] += Math.abs(Math.sin(ph)) * 0.08 * sp;
      J.lgL.rot[0] = Math.sin(ph) * 0.8 * sp; J.bkR.rot[0] = Math.sin(ph) * 0.8 * sp;
      J.lgR.rot[0] = -Math.sin(ph) * 0.8 * sp; J.bkL.rot[0] = -Math.sin(ph) * 0.8 * sp;
      J.head.rot[0] = swing * 0.6 - 0.1;
      J.head.pos[2] += swing * 0.3;
      break;
    case 'biped':
      J.body.pos[1] += Math.abs(Math.sin(ph)) * 0.08 * sp;
      J.lgL.rot[0] = Math.sin(ph) * 0.9 * sp; J.lgR.rot[0] = -Math.sin(ph) * 0.9 * sp;
      J.head.rot[0] = swing * 0.9;
      break;
    case 'golem':
      J.body.pos[1] += Math.sin(t * 1.5) * 0.05 + Math.abs(Math.sin(ph)) * 0.1 * sp;
      J.body.rot[2] = Math.sin(ph) * 0.06 * sp;
      J.lgL.rot[0] = Math.sin(ph) * 0.5 * sp; J.lgR.rot[0] = -Math.sin(ph) * 0.5 * sp;
      J.shR.rot[0] = -swing * 2.2; J.shL.rot[0] = -swing * 1.2 + Math.sin(ph) * 0.3 * sp;
      if (st.cast >= 0) { const k = Math.sin(Math.min(1, st.cast) * PI); J.shR.rot[0] = -2.6 * k; J.shL.rot[0] = -2.6 * k; }
      if (r.m.core) r.m.core.emissive = 2.2 + Math.sin(t * 4) * 0.8;
      break;
    case 'drake': {
      J.body.pos[1] += Math.sin(t * 1.6) * 0.15;
      const flap = Math.sin(t * (sp > 0.1 ? 7 : 2.5)) * (sp > 0.1 ? 0.6 : 0.25);
      J.wingL.rot[2] = flap; J.wingR.rot[2] = -flap;
      J.tail.rot[1] = Math.sin(t * 2) * 0.3;
      J.lgL.rot[0] = Math.sin(ph) * 0.5 * sp; J.bkR.rot[0] = Math.sin(ph) * 0.5 * sp;
      J.lgR.rot[0] = -Math.sin(ph) * 0.5 * sp; J.bkL.rot[0] = -Math.sin(ph) * 0.5 * sp;
      J.head.rot[0] = swing * 0.5 + (st.cast >= 0 ? -0.3 + Math.sin(st.cast * PI) * 0.5 : 0);
      break;
    }
    case 'tower':
      if (J.crystal) {
        J.crystal.pos[1] += Math.sin(t * 1.5) * 0.25;
        J.crystal.rot[1] = t * 0.8;
        if (r.m.ring) r.m.ring.rot[0] = PI / 2 + Math.sin(t) * 0.25;
      }
      break;
    case 'spire':
      J.crystal.pos[1] += Math.sin(t * 1.1) * 0.4;
      J.crystal.rot[1] = t * 0.3;
      J.rings.rot[1] = t * 0.9;
      J.rings.rot[2] = Math.sin(t * 0.7) * 0.2;
      break;
  }
  if (st.dead >= 0 && model.style !== 'tower' && model.style !== 'spire') {
    const d = Math.min(1, st.dead / 0.5);
    J.root.rot[2] = d * 1.4;
    J.root.pos[1] = -d * 0.3;
  }
}
