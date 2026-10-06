// Visual effects: CPU particle system, projectile visuals, ability effects, telegraphs.
import { mat4, hex } from '../engine/mat.js';
import { heightAt } from './terrain.js';
import { FOUNTAIN_POS } from '../../shared/map.js';

const M = mat4.create();
const C = (h) => hex(h);
const COL = {
  white: [1, 1, 1], gold: C(0xffd36a), fire: C(0xff7a2a), fire2: C(0xffc04a), ember: C(0xff4a1a), smoke: [0.25, 0.22, 0.22],
  arcane: C(0xb08cff), cyan: C(0x6ae8ff), green: C(0x6dffb5), toxic: C(0x8aff6a), holy: C(0xfff0a8), red: C(0xff3b5c),
  ice: C(0xbff3ff), iceDeep: C(0x6ac8ff), wind: C(0xc8fff4), dirt: C(0xa88a5a), rock: C(0x8a8478), blue: C(0x7fd0ff), orange: C(0xff9a4a),
  shadow: C(0x6a2a6a), heal: C(0x8aff9a),
};

const PROJ = {
  arcane: { core: COL.arcane, size: 0.45, trail: COL.arcane, rate: 40 },
  arcaneBolt: { core: COL.cyan, size: 0.9, trail: COL.arcane, rate: 90, mesh: 'gem', meshCol: COL.cyan, meshS: 0.5 },
  arrow: { core: COL.toxic, size: 0.25, trail: COL.white, rate: 30, mesh: 'blade', meshCol: C(0xd8e8c0), meshS: 0.8, thin: true },
  bigArrow: { core: COL.toxic, size: 0.6, trail: COL.toxic, rate: 80, mesh: 'blade', meshCol: C(0xc8ffb0), meshS: 1.4, thin: true },
  hunterArrow: { core: COL.toxic, size: 1.4, trail: COL.green, rate: 140, mesh: 'blade', meshCol: C(0xd0ffc0), meshS: 3, thin: true },
  soul: { core: COL.green, size: 0.45, trail: COL.green, rate: 40 },
  bone: { core: COL.green, size: 0.5, trail: C(0xe6dfc8), rate: 50, mesh: 'cone', meshCol: C(0xe6dfc8), meshS: 0.9, thin: true },
  holy: { core: COL.holy, size: 0.45, trail: COL.gold, rate: 40 },
  lance: { core: COL.holy, size: 0.8, trail: COL.gold, rate: 90, mesh: 'blade', meshCol: COL.holy, meshS: 1.3, thin: true },
  ember: { core: COL.fire, size: 0.45, trail: COL.fire, rate: 50 },
  fireball: { core: COL.fire2, size: 1.2, trail: COL.fire, rate: 140, mesh: 'sphere', meshCol: COL.fire2, meshS: 0.8, smoke: true },
  iceShard: { core: COL.ice, size: 0.7, trail: COL.ice, rate: 80, mesh: 'octa', meshCol: COL.ice, meshS: 0.8 },
  tornado: { core: COL.wind, size: 0.8, trail: COL.wind, rate: 160, tornado: true },
  towerB: { core: COL.blue, size: 0.9, trail: COL.blue, rate: 70, mesh: 'gem', meshCol: COL.blue, meshS: 0.6 },
  towerR: { core: COL.orange, size: 0.9, trail: COL.orange, rate: 70, mesh: 'gem', meshCol: COL.orange, meshS: 0.6 },
  casterB: { core: COL.blue, size: 0.35, trail: COL.blue, rate: 25 },
  casterR: { core: COL.orange, size: 0.35, trail: COL.orange, rate: 25 },
  siegeB: { core: COL.blue, size: 0.6, trail: COL.smoke, rate: 30, mesh: 'sphere', meshCol: [0.3, 0.3, 0.35], meshS: 0.45, smoke: true },
  siegeR: { core: COL.orange, size: 0.6, trail: COL.smoke, rate: 30, mesh: 'sphere', meshCol: [0.3, 0.3, 0.35], meshS: 0.45, smoke: true },
  bolt: { core: COL.white, size: 0.4, trail: COL.white, rate: 30 },
};

export class VFX {
  constructor(R, opts) {
    this.R = R;
    this.max = R.quality === 'low' ? 1200 : 3200;
    this.p = [];
    this.free = [];
    this.projs = new Map();
    this.effects = [];
    this.teles = [];
    this.getPos = opts.getPos; // id -> {x,y,z} | null
    this.shake = opts.shake; // (amount)
    this.myTeam = 0;
    this.t = 0;
    this.lowFx = R.quality === 'low';
  }

  // ---------------------------------------------------------------- particles
  spawn(o) {
    if (this.p.length >= this.max) return;
    const q = this.free.pop() || {};
    q.x = o.x; q.y = o.y; q.z = o.z;
    q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
    q.life = 0; q.max = o.life || 0.6;
    q.s0 = o.size ?? 0.5; q.s1 = o.size1 ?? q.s0 * 0.2;
    q.c = o.c || COL.white; q.a = o.a ?? 1;
    q.shape = o.shape || 0; q.add = o.add ?? 1; q.g = o.g || 0; q.drag = o.drag ?? 1.5;
    q.flat = o.flat || 0; q.rot = o.rot || 0; q.rs = o.rs || 0; q.aux = o.aux || 0;
    this.p.push(q);
  }

  burst(x, y, z, n, o) {
    const sp = o.speed ?? 4;
    if (this.lowFx) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (o.up ?? 0.5) + (Math.random() - 0.5) * (o.spreadY ?? 1);
      const v = sp * (0.4 + Math.random() * 0.8);
      this.spawn({
        x: x + (Math.random() - 0.5) * (o.jitter || 0), y, z: z + (Math.random() - 0.5) * (o.jitter || 0),
        vx: Math.cos(a) * v, vy: e * v, vz: Math.sin(a) * v, life: (o.life || 0.6) * (0.6 + Math.random() * 0.7),
        size: (o.size || 0.5) * (0.6 + Math.random() * 0.8), size1: o.size1, c: o.c, a: o.a, shape: o.shape, add: o.add,
        g: o.g ?? 0, drag: o.drag, rot: Math.random() * 6, rs: (Math.random() - 0.5) * 6,
      });
    }
  }

  ring(x, z, radius, c, dur = 0.5, width = 0.15, y) {
    this.spawn({ x, y: (y ?? heightAt(x, z)) + 0.15, z, size: radius * 0.2, size1: radius, c, life: dur, shape: 1, flat: 1, aux: width, drag: 0 });
  }

  // ---------------------------------------------------------------- projectiles
  addProj(ev) {
    const vis = PROJ[ev.v] || PROJ.bolt;
    const y = this.projY(ev);
    this.projs.set(ev.p, {
      id: ev.p, x: ev.x, z: ev.z, y, dx: ev.dx, dz: ev.dz, sp: ev.sp, range: ev.r, trav: 0, tg: ev.tg, vis, w: ev.w, age: 0, acc: 0,
      team: ev.tm, kind: ev.v,
    });
  }
  projY(ev) {
    if (ev.v === 'towerB' || ev.v === 'towerR') return 9;
    const o = this.getPos(ev.o);
    return (o ? o.y : heightAt(ev.x, ev.z)) + 1.3;
  }
  endProj(ev) {
    const p = this.projs.get(ev.p);
    if (!p) return;
    this.projs.delete(ev.p);
    const y = heightAt(ev.x, ev.z) + 1.1;
    const c = p.vis.core;
    if (ev.h) {
      this.burst(ev.x, y, ev.z, p.vis.size > 0.8 ? 14 : 7, { c, size: p.vis.size * 0.7, life: 0.35, speed: 5 });
      this.spawn({ x: ev.x, y, z: ev.z, size: p.vis.size * 2.2, size1: p.vis.size * 0.5, c, life: 0.18 });
    } else if (p.vis.size > 0.6) {
      this.burst(ev.x, y, ev.z, 5, { c, size: p.vis.size * 0.5, life: 0.3, speed: 2 });
    }
  }

  updateProjs(dt) {
    for (const p of this.projs.values()) {
      p.age += dt;
      if (p.tg) {
        const t = this.getPos(p.tg);
        if (t) {
          const ty = t.y + 1.0;
          const dx = t.x - p.x, dz = t.z - p.z, dy = ty - p.y;
          const d = Math.hypot(dx, dz, dy);
          const step = p.sp * dt;
          if (d <= step) { p.x = t.x; p.z = t.z; p.y = ty; }
          else { p.x += (dx / d) * step; p.z += (dz / d) * step; p.y += (dy / d) * step; p.dx = dx / d; p.dz = dz / d; }
        }
      } else {
        const step = p.sp * dt;
        if (p.trav < p.range) {
          p.x += p.dx * step; p.z += p.dz * step; p.trav += step;
          const gy = heightAt(p.x, p.z) + 1.2;
          p.y += (gy - p.y) * Math.min(1, dt * 6);
        }
      }
      if (p.age > 8) this.projs.delete(p.id);
      // trail
      const v = p.vis;
      p.acc += dt * v.rate * (this.lowFx ? 0.5 : 1);
      while (p.acc > 1) {
        p.acc -= 1;
        this.spawn({
          x: p.x + (Math.random() - 0.5) * 0.25, y: p.y + (Math.random() - 0.5) * 0.25, z: p.z + (Math.random() - 0.5) * 0.25,
          vx: -p.dx * 1.5, vz: -p.dz * 1.5, vy: v.smoke ? 0.8 : 0.2, life: v.smoke ? 0.55 : 0.3,
          size: v.size * (v.smoke ? 0.9 : 0.6), size1: v.size * 0.1, c: v.smoke && Math.random() < 0.4 ? COL.smoke : v.trail, add: v.smoke && Math.random() < 0.4 ? 0 : 1, a: 0.8,
        });
      }
      if (v.tornado) {
        for (let i = 0; i < 3; i++) {
          const a = this.t * 14 + i * 2.1, h = (i / 3) * 3;
          this.spawn({ x: p.x + Math.cos(a) * (0.6 + h * 0.35), y: heightAt(p.x, p.z) + 0.3 + h, z: p.z + Math.sin(a) * (0.6 + h * 0.35), life: 0.25, size: 0.5, c: COL.wind, a: 0.7 });
        }
      }
    }
  }

  drawProjs() {
    const R = this.R;
    for (const p of this.projs.values()) {
      const v = p.vis;
      R.sprite(p.x, p.y, p.z, v.size * (1.2 + Math.sin(this.t * 30) * 0.1), v.core[0], v.core[1], v.core[2], 0.95, 0, 1);
      if (v.mesh) {
        const yaw = Math.atan2(p.dx, p.dz);
        const s = v.meshS;
        if (v.thin) {
          mat4.compose(M, p.x - p.dx * s * 0.5, p.y, p.z - p.dz * s * 0.5, Math.PI / 2, yaw, 0, s * 0.18, s, 1);
          R.push(v.mesh, M, v.meshCol, 1, 1.0, s * 0.18, s, 1, false);
        } else {
          mat4.compose(M, p.x, p.y, p.z, this.t * 5, yaw + this.t * 3, 0, s, s, s);
          R.push(v.mesh, M, v.meshCol, 1, 1.4, s, s, s, false);
        }
      }
    }
  }

  // ---------------------------------------------------------------- telegraphs
  tele(ev) {
    this.teles.push({ ...ev, age: 0 });
  }

  // ---------------------------------------------------------------- effect events
  fx(ev) {
    const R = this.R;
    const x = ev.x, z = ev.z;
    const gy = heightAt(x, z);
    const ent = ev.i ? this.getPos(ev.i) : null;
    const y = ent ? ent.y : gy;
    switch (ev.v) {
      case 'hit':
        this.burst(x, y + 1.1, z, 6, { c: COL.white, size: 0.35, life: 0.25, speed: 6, shape: 2 });
        this.spawn({ x, y: y + 1.1, z, size: 1.2, size1: 0.2, c: COL.gold, life: 0.12 });
        break;
      case 'whiff':
        break;
      case 'dodge':
        this.burst(x, gy + 0.2, z, 10, { c: COL.dirt, size: 0.7, life: 0.5, speed: 3, up: 0.3, add: 0, a: 0.5, shape: 4 });
        break;
      case 'bash':
        this.burst(x, y + 1.2, z, 16, { c: COL.gold, size: 0.5, life: 0.4, speed: 8, shape: 2 });
        this.ring(x, z, 3, COL.gold, 0.35, 0.12);
        this.shake(0.25);
        break;
      case 'bulwark':
        this.effects.push({ kind: 'bubble', id: ev.i, dur: ev.d || 3, age: 0, c: COL.gold, r: 1.6 });
        this.ring(x, z, ev.r, COL.gold, 0.5, 0.1);
        break;
      case 'quake':
        this.ring(x, z, ev.r * 1.1, COL.gold, 0.5, 0.18);
        this.ring(x, z, ev.r * 0.7, COL.white, 0.35, 0.25);
        this.burst(x, gy + 0.3, z, 30, { c: COL.rock, size: 0.6, life: 0.8, speed: 9, up: 1.2, g: -18, add: 0, shape: 3, a: 1 });
        this.burst(x, gy + 0.5, z, 20, { c: COL.dirt, size: 1.4, life: 0.9, speed: 4, up: 0.4, add: 0, a: 0.5, shape: 4 });
        this.shake(0.8);
        break;
      case 'arcaneHit':
        this.burst(x, y + 1.1, z, 14, { c: COL.cyan, size: 0.5, life: 0.4, speed: 6, shape: 2 });
        break;
      case 'stardust':
        this.burst(x, gy + 1, z, 26, { c: COL.arcane, size: 0.5, life: 0.6, speed: 5, shape: 2 });
        this.ring(x, z, ev.r, COL.cyan, 0.4, 0.12);
        break;
      case 'starfallCall':
        this.effects.push({ kind: 'star', x, z, dur: ev.d, age: 0, r: ev.r });
        break;
      case 'starfall':
        this.ring(x, z, ev.r * 1.15, COL.cyan, 0.6, 0.2);
        this.ring(x, z, ev.r * 0.6, COL.white, 0.4, 0.3);
        this.burst(x, gy + 0.5, z, 50, { c: COL.arcane, size: 0.8, life: 0.9, speed: 12, up: 0.8, shape: 2 });
        this.burst(x, gy + 0.5, z, 30, { c: COL.cyan, size: 1.4, life: 0.6, speed: 6, up: 1.5 });
        this.spawn({ x, y: gy + 1.5, z, size: ev.r * 1.6, size1: ev.r * 0.2, c: COL.white, life: 0.25 });
        this.shake(0.7);
        break;
      case 'shadowCut':
        this.burst(x, y + 1.1, z, 12, { c: COL.red, size: 0.5, life: 0.35, speed: 7, shape: 2 });
        break;
      case 'veil':
      case 'unveil':
        this.burst(x, gy + 1, z, 22, { c: [0.15, 0.08, 0.2], size: 1.4, life: 0.8, speed: 3, add: 0, a: 0.7, shape: 4 });
        this.burst(x, gy + 1, z, 10, { c: COL.red, size: 0.4, life: 0.5, speed: 4, shape: 2 });
        break;
      case 'deathmark':
        this.effects.push({ kind: 'mark', id: ev.i, dur: 0.6, age: 0 });
        this.burst(x, y + 1.2, z, 24, { c: COL.red, size: 0.6, life: 0.5, speed: 9, shape: 2 });
        this.shake(0.4);
        break;
      case 'cleave':
        this.effects.push({ kind: 'spin', id: ev.i, dur: 0.35, age: 0, r: ev.r, c: COL.orange });
        this.ring(x, z, ev.r, COL.orange, 0.35, 0.12);
        this.shake(0.2);
        break;
      case 'fissure': {
        const dx = Math.sin(ev.a), dz = Math.cos(ev.a);
        for (let i = 1; i <= 8; i++) {
          const px = x + dx * (i * ev.l) / 8, pz = z + dz * (i * ev.l) / 8;
          this.effects.push({ kind: 'spike', x: px, z: pz, delay: i * 0.03, dur: 0.6, age: 0, s: 0.7 + Math.random() * 0.5, c: COL.rock });
          this.burst(px, heightAt(px, pz) + 0.3, pz, 4, { c: COL.dirt, size: 0.9, life: 0.6, speed: 3, up: 1, add: 0, a: 0.5, shape: 4 });
        }
        this.shake(0.35);
        break;
      }
      case 'rage':
        this.effects.push({ kind: 'aura', id: ev.i, dur: ev.d, age: 0, c: COL.ember, rate: 40 });
        this.ring(x, z, 4, COL.ember, 0.5, 0.2);
        this.shake(0.3);
        break;
      case 'bigHit':
        this.burst(x, y + 1.2, z, 30, { c: COL.toxic, size: 0.7, life: 0.6, speed: 10, shape: 2 });
        this.ring(x, z, 3.5, COL.toxic, 0.4, 0.15);
        this.shake(0.5);
        break;
      case 'rootFx':
        this.effects.push({ kind: 'roots', id: ev.i, x, z, dur: ev.d || 1.2, age: 0 });
        break;
      case 'mire':
        this.effects.push({ kind: 'zone', x, z, r: ev.r, dur: ev.d, age: 0, c: COL.green, c2: [0.12, 0.3, 0.15], bubbles: true });
        break;
      case 'raise':
        this.burst(x, gy + 0.2, z, 40, { c: COL.green, size: 0.7, life: 1.0, speed: 3, up: 2.5, g: 1 });
        this.ring(x, z, ev.r + 1, COL.green, 0.6, 0.15);
        break;
      case 'healBurst':
        this.effects.push({ kind: 'aura', id: ev.i, dur: 0.6, age: 0, c: COL.heal, rate: 60, up: true });
        break;
      case 'sanctuary':
        this.effects.push({ kind: 'zone', x, z, r: ev.r, dur: ev.d, age: 0, c: COL.holy, c2: [0.5, 0.42, 0.15], motes: true });
        break;
      case 'dawnshield':
        this.effects.push({ kind: 'bubble', id: ev.i, dur: ev.d || 4, age: 0, c: COL.holy, r: 1.7 });
        this.burst(x, y + 1, z, 20, { c: COL.holy, size: 0.5, life: 0.7, speed: 4, up: 1.5, shape: 2 });
        break;
      case 'thrust': {
        const dx = Math.sin(ev.a), dz = Math.cos(ev.a);
        for (let i = 0; i < 10; i++) {
          const t = i / 10;
          this.spawn({ x: x + dx * ev.l * t, y: gy + 1.2, z: z + dz * ev.l * t, vx: dx * 8, vz: dz * 8, life: 0.18, size: 0.5 * (1 - t * 0.5), c: COL.wind, shape: 0 });
        }
        break;
      }
      case 'tempest':
        this.effects.push({ kind: 'cyclone', x, z, r: ev.r, dur: 1.0, age: 0 });
        this.ring(x, z, ev.r, COL.wind, 0.5, 0.2);
        this.shake(0.5);
        break;
      case 'explosion':
        this.spawn({ x, y: gy + 1, z, size: ev.r * 1.5, size1: ev.r * 0.3, c: COL.fire2, life: 0.22 });
        this.burst(x, gy + 0.8, z, 34, { c: COL.fire, size: 1.0, life: 0.6, speed: 8, up: 0.8 });
        this.burst(x, gy + 0.8, z, 14, { c: [0.2, 0.15, 0.12], size: 1.6, life: 1.0, speed: 3, up: 1.2, add: 0, a: 0.55, shape: 4 });
        this.ring(x, z, ev.r, COL.fire2, 0.35, 0.18);
        this.shake(0.35);
        break;
      case 'flamewall':
        this.effects.push({ kind: 'wall', x, z, a: ev.a, l: ev.l, r: ev.r, dur: ev.d, age: 0 });
        break;
      case 'inferno':
        this.effects.push({ kind: 'inferno', id: ev.i, r: ev.r, dur: ev.d, age: 0 });
        break;
      case 'iceHit':
        this.burst(x, y + 1.1, z, 16, { c: COL.ice, size: 0.45, life: 0.5, speed: 6, shape: 2 });
        break;
      case 'glacial':
        this.effects.push({ kind: 'bubble', id: ev.i, dur: ev.d, age: 0, c: COL.ice, r: 1.9 });
        this.effects.push({ kind: 'aura', id: ev.i, dur: ev.d, age: 0, c: COL.ice, rate: 30, ringR: ev.r });
        break;
      case 'frostnova':
        this.ring(x, z, ev.r * 1.1, COL.ice, 0.6, 0.2);
        this.ring(x, z, ev.r * 0.7, COL.white, 0.4, 0.3);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2, d = ev.r * (0.4 + Math.random() * 0.55);
          this.effects.push({ kind: 'spike', x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, delay: Math.random() * 0.08, dur: 1.4, age: 0, s: 0.8 + Math.random() * 0.7, c: COL.ice, ice: true });
        }
        this.burst(x, gy + 1, z, 40, { c: COL.ice, size: 0.6, life: 0.8, speed: 10, up: 0.6, shape: 2 });
        this.shake(0.6);
        break;
      case 'breath': {
        const dx = Math.sin(ev.a), dz = Math.cos(ev.a);
        for (let i = 0; i < 70; i++) {
          const sp = 10 + Math.random() * 8, spread = (Math.random() - 0.5) * 1.1;
          const ddx = dx * Math.cos(spread) + dz * Math.sin(spread), ddz = dz * Math.cos(spread) - dx * Math.sin(spread);
          this.spawn({ x: x + dx * 2.5, y: gy + 3.2, z: z + dz * 2.5, vx: ddx * sp, vy: -2, vz: ddz * sp, life: 0.7, size: 1.2, size1: 2.2, c: Math.random() < 0.5 ? COL.fire : COL.fire2, drag: 1 });
        }
        this.shake(0.4);
        break;
      }
      case 'slam':
        this.ring(x, z, ev.r, COL.arcane, 0.6, 0.2);
        this.burst(x, gy + 0.3, z, 30, { c: COL.rock, size: 0.7, life: 0.9, speed: 9, up: 1.2, g: -18, add: 0, shape: 3, a: 1 });
        this.burst(x, gy + 0.4, z, 16, { c: COL.dirt, size: 2, life: 1, speed: 4, up: 0.4, add: 0, a: 0.45, shape: 4 });
        this.shake(0.7);
        break;
      case 'fountain': {
        const [fx, fz] = FOUNTAIN_POS[ev.tm];
        const t = ent || { x: ev.x, y: 0, z: ev.z };
        for (let i = 0; i < 12; i++) {
          const k = i / 12;
          this.spawn({ x: fx + (t.x - fx) * k, y: 4 + (t.y + 1 - 4) * k, z: fz + (t.z - fz) * k, life: 0.2, size: 0.6, c: ev.tm ? COL.orange : COL.blue });
        }
        break;
      }
    }
  }

  // generic events (level-up, spawn, recall etc.)
  levelUp(p) {
    this.burst(p.x, p.y + 0.2, p.z, 30, { c: COL.gold, size: 0.5, life: 1.0, speed: 2.5, up: 3, shape: 2 });
    this.ring(p.x, p.z, 3, COL.gold, 0.6, 0.12, p.y);
  }
  respawn(p, team) {
    const c = team ? COL.orange : COL.blue;
    this.burst(p.x, p.y + 0.2, p.z, 40, { c, size: 0.6, life: 1.0, speed: 2, up: 4 });
    this.ring(p.x, p.z, 3, c, 0.6, 0.15, p.y);
  }
  recallDone(p, team) {
    const c = team ? COL.orange : COL.blue;
    this.burst(p.x, p.y + 1, p.z, 30, { c, size: 0.7, life: 0.8, speed: 1.5, up: 5 });
  }
  deathBurst(p, big) {
    this.burst(p.x, p.y + 1, p.z, big ? 28 : 8, { c: [0.3, 0.28, 0.3], size: big ? 1.4 : 0.8, life: 0.9, speed: 2.5, up: 0.8, add: 0, a: 0.6, shape: 4 });
  }
  structureDown(x, z, team) {
    const c = team ? COL.orange : COL.blue;
    const gy = heightAt(x, z);
    this.burst(x, gy + 5, z, 60, { c: COL.rock, size: 1.0, life: 1.4, speed: 10, up: 1.4, g: -16, add: 0, shape: 3, a: 1 });
    this.burst(x, gy + 3, z, 40, { c: [0.35, 0.33, 0.3], size: 3, life: 1.6, speed: 4, up: 0.6, add: 0, a: 0.6, shape: 4 });
    this.burst(x, gy + 8, z, 40, { c, size: 0.8, life: 1.2, speed: 9, up: 0.5, shape: 2 });
    this.ring(x, z, 10, c, 0.8, 0.2);
    this.shake(1.0);
  }
  blink(x0, z0, x1, z1, c = COL.arcane) {
    const g0 = heightAt(x0, z0), g1 = heightAt(x1, z1);
    this.burst(x0, g0 + 1, z0, 18, { c, size: 0.6, life: 0.5, speed: 4, shape: 2 });
    this.burst(x1, g1 + 1, z1, 18, { c, size: 0.6, life: 0.5, speed: 4, shape: 2 });
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      this.spawn({ x: x0 + (x1 - x0) * k, y: g0 + 1 + (g1 - g0) * k, z: z0 + (z1 - z0) * k, life: 0.3, size: 0.5, c });
    }
  }
  dashTrail(p, c) {
    this.spawn({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + 0.5 + Math.random() * 1.2, z: p.z + (Math.random() - 0.5) * 0.6, life: 0.3, size: 0.6, c, a: 0.7 });
  }
  slash(p, yaw, c, big = 1, flip = false) {
    this.effects.push({ kind: 'slash', x: p.x, y: p.y + 1.1, z: p.z, yaw, dur: 0.18, age: 0, c, s: 2.4 * big, flip });
  }

  // ---------------------------------------------------------------- update & draw
  update(dt) {
    this.t += dt;
    // particles
    const arr = this.p;
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      q.life += dt;
      if (q.life >= q.max) { this.free.push(q); continue; }
      const dr = Math.max(0, 1 - q.drag * dt);
      q.vx *= dr; q.vy = q.vy * dr + q.g * dt; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.rs * dt;
      arr[w++] = q;
    }
    arr.length = w;
    this.updateProjs(dt);
    // persistent effects
    for (const e of this.effects) {
      e.age += dt;
      this.tickEffect(e, dt);
    }
    this.effects = this.effects.filter((e) => e.age < e.dur + (e.delay || 0));
    for (const t of this.teles) t.age += dt;
    this.teles = this.teles.filter((t) => t.age < t.d + 0.1);
  }

  tickEffect(e, dt) {
    const rate = (n) => Math.random() < n * dt * (this.lowFx ? 0.5 : 1);
    if (e.kind === 'aura' || e.kind === 'inferno' || e.kind === 'bubble' || e.kind === 'mark' || e.kind === 'spin' || e.kind === 'roots') {
      const p = this.getPos(e.id);
      if (!p) { e.age = e.dur + 1; return; }
      e.px = p.x; e.py = p.y; e.pz = p.z;
    }
    switch (e.kind) {
      case 'aura': {
        const n = Math.ceil(e.rate * dt * (this.lowFx ? 0.5 : 1) + Math.random());
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.28, r = e.ringR ? e.ringR * Math.random() : 0.8;
          this.spawn({ x: e.px + Math.cos(a) * r, y: e.py + 0.2 + Math.random() * 2, z: e.pz + Math.sin(a) * r, vy: e.up ? 3 : 1.2, life: 0.6, size: 0.4, c: e.c, shape: e.up ? 2 : 0 });
        }
        break;
      }
      case 'inferno': {
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * 6.28, r = e.r * Math.sqrt(Math.random());
          const x = e.px + Math.cos(a) * r, z = e.pz + Math.sin(a) * r;
          this.spawn({ x, y: heightAt(x, z) + 0.3, z, vy: 4 + Math.random() * 3, life: 0.55, size: 0.9, size1: 0.2, c: Math.random() < 0.5 ? COL.fire : COL.fire2 });
        }
        if (rate(4)) this.ring(e.px, e.pz, e.r, COL.fire, 0.4, 0.15);
        break;
      }
      case 'zone': {
        if (e.bubbles && rate(25)) {
          const a = Math.random() * 6.28, r = e.r * Math.sqrt(Math.random());
          const x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
          this.spawn({ x, y: heightAt(x, z) + 0.1, z, vy: 1.5, life: 0.7, size: 0.4, c: e.c, shape: 1, aux: 0.3 });
        }
        if (e.motes && rate(30)) {
          const a = Math.random() * 6.28, r = e.r * Math.sqrt(Math.random());
          const x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
          this.spawn({ x, y: heightAt(x, z) + 0.2, z, vy: 2.2, life: 0.9, size: 0.35, c: e.c, shape: 2 });
        }
        break;
      }
      case 'wall': {
        const dx = Math.sin(e.a), dz = Math.cos(e.a);
        for (let i = 0; i < 5; i++) {
          const t = Math.random(), off = (Math.random() - 0.5) * e.r * 1.6;
          const x = e.x + dx * e.l * t - dz * off, z = e.z + dz * e.l * t + dx * off;
          this.spawn({ x, y: heightAt(x, z) + 0.2, z, vy: 3 + Math.random() * 3, life: 0.5, size: 0.9, size1: 0.15, c: Math.random() < 0.5 ? COL.fire : COL.fire2 });
        }
        break;
      }
      case 'cyclone': {
        for (let i = 0; i < 8; i++) {
          const a = this.t * 10 + i * 0.8, k = 1 - e.age / e.dur;
          const r = e.r * k * (0.4 + (i % 3) * 0.3);
          this.spawn({ x: e.x + Math.cos(a) * r, y: heightAt(e.x, e.z) + 0.3 + (i % 4) * 0.8, z: e.z + Math.sin(a) * r, life: 0.2, size: 0.6, c: COL.wind, a: 0.8 });
        }
        break;
      }
      case 'star': {
        if (rate(30)) this.spawn({ x: e.x + (Math.random() - 0.5) * 2, y: heightAt(e.x, e.z) + 0.3, z: e.z + (Math.random() - 0.5) * 2, vy: 2, life: 0.5, size: 0.4, c: COL.cyan, shape: 2 });
        break;
      }
    }
  }

  draw() {
    const R = this.R;
    const t = this.t;
    // effects that draw meshes / sprites each frame
    for (const e of this.effects) {
      const k = Math.min(1, e.age / Math.max(0.001, e.dur));
      switch (e.kind) {
        case 'bubble': {
          if (e.px == null) break;
          const s = e.r * 2 * (1 + Math.sin(t * 6) * 0.03);
          mat4.compose(M, e.px, e.py + 1.1, e.pz, 0, t, 0, s, s * 1.05, s);
          R.push('sphere', M, e.c, 0.22 * (1 - k * 0.6), 1.2, s, s * 1.05, s, false);
          break;
        }
        case 'zone': {
          const fade = Math.min(1, e.age * 4) * Math.min(1, (e.dur - e.age) * 4);
          R.decal(1, e.x, heightAt(e.x, e.z) + 0.1, e.z, 0, e.r * 2, e.r * 2, e.c, 0.6 * fade, 1);
          break;
        }
        case 'wall': {
          const fade = Math.min(1, e.age * 4) * Math.min(1, (e.dur - e.age) * 4);
          const dx = Math.sin(e.a), dz = Math.cos(e.a);
          R.decal(2, e.x + dx * e.l / 2, heightAt(e.x, e.z) + 0.1, e.z + dz * e.l / 2, e.a, e.r * 2, e.l, COL.fire, 0.7 * fade, 1, 4);
          break;
        }
        case 'star': {
          const h = 40 * (1 - k * k);
          R.sprite(e.x, heightAt(e.x, e.z) + h, e.z, 2.6, COL.cyan[0], COL.cyan[1], COL.cyan[2], 1, 2, 1, t * 4);
          R.sprite(e.x, heightAt(e.x, e.z) + h, e.z, 4.5, 1, 1, 1, 0.7, 0, 1);
          for (let i = 1; i < 6; i++) R.sprite(e.x, heightAt(e.x, e.z) + h + i * 2.2, e.z, 1.6 - i * 0.2, COL.arcane[0], COL.arcane[1], COL.arcane[2], 0.6 - i * 0.08, 0, 1);
          break;
        }
        case 'spike': {
          if (e.age < (e.delay || 0)) break;
          const a = (e.age - (e.delay || 0)) / e.dur;
          const grow = a < 0.15 ? a / 0.15 : a > 0.75 ? Math.max(0, 1 - (a - 0.75) / 0.25) : 1;
          const s = e.s * grow;
          if (s <= 0.01) break;
          const gy = heightAt(e.x, e.z);
          mat4.compose(M, e.x, gy + s * 0.7, e.z, 0.2 * Math.sin(e.x), e.x, 0.2 * Math.cos(e.z), s * 0.7, s * 2.2, s * 0.7);
          R.push(e.ice ? 'octa' : 'rock', M, e.c, 1, e.ice ? 0.8 : 0, s * 0.7, s * 2.2, s * 0.7, true);
          break;
        }
        case 'roots': {
          if (e.px == null) break;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * 6.28 + 0.3;
            const s = Math.min(1, e.age * 6) * (1 - Math.max(0, (e.age - e.dur + 0.2) * 5));
            mat4.compose(M, e.px + Math.cos(a) * 0.7, e.py + 0.5 * s, e.pz + Math.sin(a) * 0.7, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4, 0.25 * s, 1.3 * s, 0.25 * s);
            R.push('cone', M, [0.9, 0.87, 0.78], 1, 0.1, 0.25 * s, 1.3 * s, 0.25 * s, true);
          }
          break;
        }
        case 'slash': {
          const s = e.s * (0.8 + k * 0.4);
          mat4.compose(M, e.x, e.y, e.z, e.flip ? 0.5 : -0.5, e.yaw + (k - 0.5) * 1.2 * (e.flip ? -1 : 1), 0, s, s, s);
          R.push('arc', M, e.c, 0.85 * (1 - k), 2.0, s, s, s, false);
          break;
        }
        case 'spin': {
          if (e.px == null) break;
          const s = e.r;
          mat4.compose(M, e.px, e.py + 1.0, e.pz, 0, t * 25, 0, s, s, s);
          R.push('arc', M, e.c, 0.8 * (1 - k), 2, s, s, s, false);
          mat4.compose(M, e.px, e.py + 1.0, e.pz, 0, t * 25 + Math.PI, 0, s, s, s);
          R.push('arc', M, e.c, 0.8 * (1 - k), 2, s, s, s, false);
          break;
        }
        case 'mark': {
          if (e.px == null) break;
          R.sprite(e.px, e.py + 2.8, e.pz, 1.8 * (1 + k), COL.red[0], COL.red[1], COL.red[2], 1 - k, 2, 1, Math.PI / 4);
          break;
        }
      }
    }
    // telegraphs
    for (const tl of this.teles) {
      const prog = Math.min(1, tl.age / tl.d);
      const ally = tl.tm === this.myTeam;
      const c = tl.tm === 2 ? [1, 0.45, 0.15] : ally ? [0.35, 0.75, 1] : [1, 0.22, 0.25];
      const pulse = 0.75 + Math.sin(t * 18) * 0.25 * (ally ? 0 : 1);
      const gy = heightAt(tl.x, tl.z) + 0.1;
      if (tl.sh === 'circle') R.decal(1, tl.x, gy, tl.z, 0, tl.r * 2, tl.r * 2, c, pulse, prog);
      else if (tl.sh === 'cone') {
        R.decal(3, tl.x, gy, tl.z, tl.a, tl.l * 2, tl.l * 2, c, pulse, prog, tl.h);
      }
    }
    this.drawProjs();
    // particles
    for (const q of this.p) {
      const k = q.life / q.max;
      const size = q.s0 + (q.s1 - q.s0) * k;
      const a = q.a * (k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.4) / 0.6));
      R.sprite(q.x, q.y, q.z, size, q.c[0], q.c[1], q.c[2], a, q.shape, q.add, q.rot, q.flat, q.aux);
    }
  }
}

export { COL };
