// In-match client: snapshot interpolation, local prediction, third-person camera,
// action aiming (mouse or touch), rendering and event-driven effects.
import { DT, F, K, ULT_LEVEL, XP_TABLE, MAX_LEVEL } from '../shared/constants.js';
import { HERO_BY_ID } from '../shared/heroes.js';
import { ITEM_BY_ID } from '../shared/items.js';
import { resolveStatic, FOUNTAIN_POS, SHOP_RADIUS, OBSTACLES } from '../shared/map.js';
import { clamp, lerp, lerpAngle, wrapAngle } from '../shared/math.js';
import { mat4, projectPoint, hex } from './engine/mat.js';
import { heightAt } from './render/terrain.js';
import { buildHeroModel, animateHero } from './render/heroModels.js';
import { buildUnitModel, animateUnit } from './render/unitModels.js';
import { VFX, COL } from './render/vfx.js';

const ROOT = mat4.create();
const PROJ = { x: 0, y: 0, visible: false, depth: 0 };
const CAST_SFX = {
  kaelen: ['dash', 'shield', 'slam'], lyra: ['magic', 'blink', 'magic'], vex: ['dash', 'dark', 'dark'], brakka: ['heavySwing', 'slam', 'slam'],
  sylva: ['bow', 'bow', 'bow'], mordrin: ['dark', 'dark', 'dark'], aurelia: ['magic', 'heal', 'shield'], zephyr: ['swing', 'dash', 'wind'],
  ignis: ['fire', 'fire', 'fire'], rime: ['ice', 'shield', 'ice'],
};
const FX_SFX = { explosion: 'explosion', quake: 'slam', slam: 'slam', starfall: 'explosion', frostnova: 'ice', healBurst: 'heal', bash: 'bigHit', deathmark: 'bigHit', bigHit: 'bigHit', tempest: 'wind', breath: 'fire', fissure: 'slam', cleave: 'heavySwing' };
const SLASH_COL = { kaelen: hex(0xffe9a8), vex: hex(0xff3b5c), brakka: hex(0xffa54a), zephyr: hex(0xbffff4), rime: hex(0xbff3ff) };

export class ClientGame {
  constructor(app, transport, start) {
    this.app = app;
    this.R = app.renderer;
    this.audio = app.audio;
    this.input = app.input;
    this.settings = app.settings;
    this.hud = app.hud;
    this.transport = transport;
    this.vfx = new VFX(this.R, { getPos: (id) => this.posOf(id), shake: (a) => this.addShake(a) });
    this.now = 0;
    this.snaps = [];
    this.evq = [];
    this.clock = null;
    this.latestT = 0;
    this.latestRecv = 0;
    this.heroes = new Map();
    this.units = new Map();
    this.structs = new Map();
    this.shake = 0;
    this.seq = 0;
    this.tickAcc = 0;
    this.pred = { x: 0, z: 0, ox: 0, oz: 0, hist: [], ok: false, sp: 7.5 };
    this.me = null;
    this.meData = null;
    this.scoreboard = new Map();
    this.kills = [0, 0];
    this.over = false;
    this.localAtk = { until: 0, ready: 0, n: 0 };
    this.localCast = 0;
    this.pendingCasts = [];
    this.campTimers = [];
    this.drake = [0, 0];
    this.wardenBuff = [0, 0];
    this.handler = (m) => this.onMsg(m);
    transport.on(this.handler);
    this.init(start);
  }

  // ---------------------------------------------------------------- setup
  init(msg) {
    this.myId = msg.you;
    for (const r of msg.roster) {
      const def = HERO_BY_ID[r.hero];
      const model = buildHeroModel(def);
      this.heroes.set(r.id, {
        id: r.id, def, team: r.team, name: r.name, bot: r.bot, model, x: 0, y: 0, z: 0, rot: 0, hp: 1, maxHp: 1, shield: 0, level: 1, flags: 0,
        speed: 0, phase: Math.random() * 6, atkStart: -9, atkDur: 0.3, atkN: 0, castStart: -9, castSlot: 'q', deadAt: -1, flash: 0, dashUntil: 0, arc: null,
        recall: false, lastX: null, lastZ: null, seen: false,
      });
    }
    this.me = this.heroes.get(this.myId) || null;
    this.myTeam = this.me ? this.me.team : 0;
    this.vfx.myTeam = this.myTeam;
    for (const s of msg.structs) {
      this.structs.set(s.id, { ...s, hp: s.maxHp, flags: 0, dead: false, model: buildUnitModel(s.kind, s.team, 0), solid: true, flash: 0, deadAt: -1 });
    }
    this.solids = [...this.structs.values()];
    const [fx, fz] = FOUNTAIN_POS[this.myTeam];
    this.cam = { yaw: Math.atan2(-fx, -fz), pitch: 0.36, dist: this.settings.camDist || 12.5, x: fx, y: 2, z: fz };
    this.pred.x = fx; this.pred.z = fz;
    this.hud.startMatch(this);
  }

  destroy() {
    this.transport.close();
    this.hud.endMatch();
  }

  // ---------------------------------------------------------------- network
  onMsg(m) {
    if (m.t === 's') this.onSnapshot(m.d);
    else if (m.t === 'closed' && !this.over) this.hud.toast('Disconnected from server', 'bad');
    else if (m.t === 'chat') this.hud.chat(m.n, m.m);
  }

  onSnapshot(s) {
    s.recv = this.now;
    s.hmap = new Map();
    for (const h of s.H) s.hmap.set(h[0], h);
    s.mmap = new Map();
    for (const u of s.M) s.mmap.set(u[0], u);
    this.snaps.push(s);
    if (s.t > this.latestT) { this.latestT = s.t; this.latestRecv = this.now; }
    for (const ev of s.ev || []) this.evq.push({ t: s.t, ev });
    if (s.me) { this.meData = s.me; this.reconcile(s); }
    if (s.sb) for (const r of s.sb) this.scoreboard.set(r[0], { k: r[1], d: r[2], a: r[3], cs: r[4], items: r[5], gold: r[6], level: r[7] });
    if (s.cm) this.campTimers = s.cm;
    this.kills = s.k;
    this.drake = s.ds;
    this.wardenBuff = s.wb;
    for (const st of s.S) {
      const v = this.structs.get(st[0]);
      if (!v) continue;
      if (st[1] < v.hp) v.flash = 0.1;
      v.hp = st[1]; v.flags = st[2];
      if (st[1] <= 0 && !v.dead) { v.dead = true; v.solid = false; v.deadAt = this.now; }
    }
    if (this.clock == null) this.clock = s.t - this.delay();
  }

  delay() { return this.transport.local ? DT * 1.5 : 0.12; }

  reconcile(s) {
    const h = s.hmap.get(this.myId);
    if (!h) return;
    const flags = h[8];
    const p = this.pred;
    p.sp = s.me.sp || p.sp;
    const locked = flags & (F.DEAD | F.STUN | F.AIRBORNE | F.ROOT | F.DASH);
    const oldX = p.x + p.ox, oldZ = p.z + p.oz;
    if (locked) {
      p.ok = false;
      p.hist.length = 0;
      p.x = h[1]; p.z = h[2];
    } else {
      p.ok = true;
      const ack = s.me.ack;
      p.hist = p.hist.filter((i) => i.seq > ack);
      let x = h[1], z = h[2];
      for (const i of p.hist) {
        x += i.mx * i.sp * DT; z += i.mz * i.sp * DT;
        [x, z] = resolveStatic(x, z, 0.8, this.solids);
      }
      p.x = x; p.z = z;
    }
    p.ox = oldX - p.x; p.oz = oldZ - p.z;
    if (Math.hypot(p.ox, p.oz) > 5 || (flags & F.DEAD)) { p.ox = 0; p.oz = 0; }
  }

  // ---------------------------------------------------------------- per frame
  frame(dt) {
    this.now += dt;
    const input = this.input;
    const cam = this.cam;
    // camera look
    const [dyaw, dpitch, dzoom] = input.takeLook();
    cam.yaw = wrapAngle(cam.yaw + dyaw);
    cam.pitch = clamp(cam.pitch + dpitch, 0.06, 0.95);
    cam.dist = clamp(cam.dist + dzoom * 1.1, 7, 22);
    const fwd = [Math.sin(cam.yaw), Math.cos(cam.yaw)];
    const right = [-Math.cos(cam.yaw), Math.sin(cam.yaw)];
    const [ix, iy] = input.moveVector();
    let mx = right[0] * ix + fwd[0] * iy, mz = right[1] * ix + fwd[1] * iy;
    if (this.input.touch && this.settings.autoCam !== false && (ix || iy) && performance.now() - input.lastTouchLook > 1200 && !input.aiming) {
      const target = Math.atan2(mx, mz);
      const diff = wrapAngle(target - cam.yaw);
      if (Math.abs(diff) < 2.4) cam.yaw = wrapAngle(cam.yaw + diff * Math.min(1, dt * 0.9) * Math.min(1, Math.hypot(ix, iy)));
    }
    const meDead = this.me && (this.me.flags & F.DEAD);
    const hud = this.hud;
    if (hud.blocking()) { mx = 0; mz = 0; }

    // client tick @30Hz: send input + predict
    this.tickAcc += Math.min(dt, 0.25);
    const evs = input.takeEvents();
    for (const e of evs) this.handleInputEvent(e);
    while (this.tickAcc >= DT) {
      this.tickAcc -= DT;
      this.sendInput(mx, mz);
    }
    this.transport.update(dt);

    // interpolation clock
    if (this.clock != null) {
      const target = this.latestT + (this.now - this.latestRecv) - this.delay();
      const drift = target - this.clock;
      this.clock += dt;
      if (Math.abs(drift) > 0.5) this.clock = target; else this.clock += drift * 0.08;
      this.clock = Math.min(this.clock, this.latestT);
    }
    this.interpolate();
    this.processEvents();

    // prediction smoothing
    const p = this.pred;
    const k = Math.exp(-dt * 14);
    p.ox *= k; p.oz *= k;
    if (this.me && p.ok && !meDead) {
      this.me.x = p.x + p.ox; this.me.z = p.z + p.oz;
    }

    this.updateViews(dt);
    this.vfx.update(dt);
    this.audio.listener.x = this.me ? this.me.x : 0;
    this.audio.listener.z = this.me ? this.me.z : 0;
    this.updateCamera(dt);
    this.drawWorld(dt);
    this.R.render();
    hud.frame(this, dt);
  }

  handleInputEvent(e) {
    if (e.type === 'quickbuy') { this.quickBuy(); return; }
    if (this.hud.blocking()) return;
    if (e.type === 'press') {
      this.pendingCasts.push({ slot: e.slot });
      return;
    }
    if (e.type === 'cast') {
      const aim = this.aimFor(e.slot, e.drag, e.quick, e.source);
      this.pendingCasts.push({ slot: e.slot, ax: aim[0], az: aim[1] });
    }
  }

  quickBuy() {
    if (!this.me) return;
    const id = this.nextRecommended();
    if (!id) return;
    this.buy(id);
  }
  nextRecommended() {
    const items = this.meData ? this.meData.it : [];
    for (const id of this.me.def.build) if (!items.includes(id)) return id;
    return null;
  }
  buy(id) {
    const it = ITEM_BY_ID[id];
    if (!this.meData) return;
    if (!this.meData.sh) { this.hud.toast('Return to base to shop', 'bad'); this.audio.play('deny'); return; }
    if (this.meData.g < it.cost) { this.hud.toast('Not enough gold', 'bad'); this.audio.play('deny'); return; }
    this.transport.send({ t: 'buy', it: id });
  }
  sell(i) { this.transport.send({ t: 'sell', i }); }

  sendInput(mx, mz) {
    const me = this.me;
    if (!me) return;
    const [ax, az] = this.aimPoint();
    const casts = [];
    let cax = ax, caz = az;
    for (const c of this.pendingCasts) {
      casts.push(c.slot);
      if (c.ax != null) {
        cax = c.ax; caz = c.az;
        if (c.slot !== 'd' && c.slot !== 'b') { me.rot = Math.atan2(cax - me.x, caz - me.z); this.faceUntil = this.now + 0.35; }
      }
      this.predictCast(c.slot);
    }
    this.pendingCasts.length = 0;
    let atk = this.input.attack && !this.hud.blocking();
    let aimX = cax, aimZ = caz;
    if (atk && !casts.length) {
      if (this.input.touch) {
        const t = this.autoTarget(me.def.stats.range + 2.5, 1.0, true);
        if (t) { aimX = t.x; aimZ = t.z; }
      }
      this.predictAttack(aimX, aimZ);
    }
    this.seq++;
    const msg = { t: 'in', s: this.seq, mx: +mx.toFixed(3), mz: +mz.toFixed(3), ax: +aimX.toFixed(2), az: +aimZ.toFixed(2), a: atk ? 1 : 0, c: casts };
    this.transport.send(msg);
    // predict own movement
    const p = this.pred;
    if (p.ok && !(me.flags & F.DEAD)) {
      let sp = p.sp;
      if (this.now < this.localAtk.until) sp *= 0.55;
      let nx = p.x + mx * sp * DT, nz = p.z + mz * sp * DT;
      [nx, nz] = resolveStatic(nx, nz, 0.8, this.solids);
      p.x = nx; p.z = nz;
      p.hist.push({ seq: this.seq, mx, mz, sp });
      if (p.hist.length > 90) p.hist.shift();
      if (Math.hypot(mx, mz) > 0.05 && this.now > this.localAtk.until && this.now > (this.faceUntil || 0)) me.rot = Math.atan2(mx, mz);
    }
  }

  predictAttack(ax, az) {
    const me = this.me;
    if (!this.meData || (me.flags & (F.DEAD | F.STUN | F.AIRBORNE))) return;
    if (this.now < this.localAtk.ready) return;
    const as = this.meData.st.as || 0.7;
    const wind = clamp(0.32 / as, 0.1, 0.3);
    this.localAtk.ready = this.now + 1 / as;
    this.localAtk.until = this.now + wind;
    me.atkStart = this.now; me.atkDur = wind * 2; me.atkN++;
    me.rot = Math.atan2(ax - me.x, az - me.z);
    this.audio.play(me.def.ranged ? (me.def.id === 'sylva' ? 'bow' : 'shoot') : (me.def.id === 'brakka' ? 'heavySwing' : 'swing'));
    if (!me.def.ranged) {
      const yaw = me.rot, flip = me.atkN % 2 === 0;
      setTimeout(() => this.vfx.slash(me, yaw, SLASH_COL[me.def.id] || [1, 1, 1], me.def.id === 'brakka' ? 1.3 : 1, flip), wind * 1000);
    }
  }

  predictCast(slot) {
    const me = this.me;
    if (!this.meData || slot === 'b' || slot === 'd') return;
    const idx = { q: 0, e: 1, r: 2 }[slot];
    if (this.meData.cd[idx] > 0.05) { this.audio.play('deny'); return; }
    if (slot === 'r' && this.meData.lv < ULT_LEVEL) { this.hud.toast(`Ultimate unlocks at level ${ULT_LEVEL}`, 'bad'); return; }
    me.castStart = this.now; me.castSlot = slot;
  }

  // ---------------------------------------------------------------- aiming
  aimRay() {
    // ray from camera through the crosshair
    const R = this.R;
    const ndcX = 0, ndcY = 1 - 2 * this.crossY();
    const inv = R.invVP;
    const tp = (x, y, z) => {
      const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
      return [(inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w, (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w, (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w];
    };
    const a = tp(ndcX, ndcY, -1), b = tp(ndcX, ndcY, 1);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d);
    return { o: a, d: d.map((v) => v / l) };
  }
  crossY() { return 0.43; }

  aimPoint() {
    const me = this.me;
    if (!me) return [0, 0];
    const fwd = [Math.sin(this.cam.yaw), Math.cos(this.cam.yaw)];
    const gy = heightAt(me.x, me.z) + 0.2;
    const { o, d } = this.aimRay();
    let px, pz;
    if (d[1] < -0.02) {
      const t = (gy - o[1]) / d[1];
      px = o[0] + d[0] * t; pz = o[2] + d[2] * t;
    } else { px = me.x + fwd[0] * 40; pz = me.z + fwd[1] * 40; }
    let dx = px - me.x, dz = pz - me.z;
    let l = Math.hypot(dx, dz);
    // if the crosshair lands behind/under the hero, push it forward
    if (l < 2 || dx * fwd[0] + dz * fwd[1] < 0) { px = me.x + fwd[0] * 6; pz = me.z + fwd[1] * 6; l = 6; dx = px - me.x; dz = pz - me.z; }
    if (l > 45) { px = me.x + (dx / l) * 45; pz = me.z + (dz / l) * 45; }
    return [px, pz];
  }

  // Touch quick-cast / auto attack: pick the best enemy in front of the camera.
  autoTarget(range, cone = 0.9, includeUnits = false) {
    const me = this.me;
    const fwd = [Math.sin(this.cam.yaw), Math.cos(this.cam.yaw)];
    let best = null, bestS = Infinity;
    const consider = (e, isHero) => {
      if (e.team === this.myTeam || !e.seen) return;
      if (e.flags & (F.DEAD | F.STEALTH)) return;
      if (e.kind === K.TOWER || e.kind === K.SPIRE) { if (e.dead || (e.flags & F.INVULN)) return; }
      const dx = e.x - me.x, dz = e.z - me.z;
      const d = Math.hypot(dx, dz) - (e.radius || 0.8);
      if (d > range) return;
      const ang = Math.acos(clamp((dx * fwd[0] + dz * fwd[1]) / (Math.hypot(dx, dz) || 1), -1, 1));
      let s = d / range + (ang > cone ? 1.5 : ang / cone * 0.5);
      if (isHero) s -= 0.7;
      if (e.hp / e.maxHp < 0.3) s -= 0.2;
      if (s < bestS) { bestS = s; best = e; }
    };
    for (const h of this.heroes.values()) if (h !== me) consider(h, true);
    if (includeUnits) {
      for (const u of this.units.values()) consider(u, false);
      for (const s of this.structs.values()) consider({ ...s, seen: true }, false);
    }
    return best;
  }

  aimFor(slot, drag, quick, source) {
    const me = this.me;
    if (!me || slot === 'd' || slot === 'b') return [me ? me.x : 0, me ? me.z : 0];
    const spec = me.def[slot];
    const range = spec.range || spec.radius || 8;
    const fwd = [Math.sin(this.cam.yaw), Math.cos(this.cam.yaw)];
    const right = [-Math.cos(this.cam.yaw), Math.sin(this.cam.yaw)];
    if (source === 'touch') {
      if (quick || !drag) {
        const t = this.autoTarget(spec.aim === 'unit' ? range + 2 : range + 3, 1.2);
        if (t) return [t.x + (t.vx || 0) * 0.15, t.z + (t.vz || 0) * 0.15];
        const d = spec.aim === 'point' ? range * 0.6 : range;
        return [me.x + fwd[0] * d, me.z + fwd[1] * d];
      }
      let dx = right[0] * drag.x + fwd[0] * -drag.y, dz = right[1] * drag.x + fwd[1] * -drag.y;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const d = spec.aim === 'point' ? Math.max(1, drag.len * range) : range;
      return [me.x + dx * d, me.z + dz * d];
    }
    const [ax, az] = this.aimPoint();
    if (spec.aim === 'point') {
      const dx = ax - me.x, dz = az - me.z;
      const l = Math.hypot(dx, dz);
      if (l > range) return [me.x + (dx / l) * range, me.z + (dz / l) * range];
    }
    return [ax, az];
  }

  // ---------------------------------------------------------------- interpolation
  interpolate() {
    const snaps = this.snaps;
    if (!snaps.length || this.clock == null) return;
    const rt = this.clock;
    while (snaps.length > 2 && snaps[1].t <= rt) snaps.shift();
    const a = snaps[0];
    const b = snaps.length > 1 ? snaps[1] : snaps[0];
    const span = b.t - a.t;
    const f = span > 0 ? clamp((rt - a.t) / span, 0, 1) : 1;
    // heroes
    for (const [id, hb] of b.hmap) {
      const v = this.heroes.get(id);
      if (!v) continue;
      const ha = a.hmap.get(id) || hb;
      const jump = Math.hypot(hb[1] - ha[1], hb[2] - ha[2]) > 12;
      const usePred = v === this.me && this.pred.ok;
      if (!usePred) {
        v.x = jump ? hb[1] : lerp(ha[1], hb[1], f);
        v.z = jump ? hb[2] : lerp(ha[2], hb[2], f);
        v.rot = lerpAngle(ha[3], hb[3], f);
        if (v === this.me) { this.pred.x = v.x; this.pred.z = v.z; this.pred.ox = 0; this.pred.oz = 0; }
      }
      if (hb[4] < v.hp - 1) v.flash = Math.max(v.flash, 0.08);
      v.hp = hb[4]; v.maxHp = hb[5]; v.shield = hb[6]; v.level = hb[7];
      const wasDead = v.flags & F.DEAD;
      v.flags = hb[8];
      if ((v.flags & F.DEAD) && !wasDead) v.deadAt = this.now;
      if (!(v.flags & F.DEAD) && wasDead) v.deadAt = -1;
      v.vx = span > 0 ? (hb[1] - ha[1]) / span : 0;
      v.vz = span > 0 ? (hb[2] - ha[2]) / span : 0;
      v.seen = true;
    }
    // units
    for (const [id, ub] of b.mmap) {
      let v = this.units.get(id);
      const ua = a.mmap.get(id) || ub;
      if (!v) {
        v = {
          id, kind: ub[1], team: ub[2], variant: ub[9], model: buildUnitModel(ub[1], ub[2], ub[9]), x: ub[3], z: ub[4], y: 0, rot: ub[5], hp: ub[6], maxHp: ub[7],
          flags: ub[8], speed: 0, phase: Math.random() * 6, atkStart: -9, atkDur: 0.5, castStart: -9, deadAt: -1, flash: 0, radius: unitRadius(ub[1], ub[9]), seen: true,
        };
        this.units.set(id, v);
        if (v.kind === K.WRAITH) this.vfx.burst(v.x, heightAt(v.x, v.z) + 0.5, v.z, 10, { c: COL.green, size: 0.6, life: 0.6, speed: 2, up: 2 });
      }
      v.x = lerp(ua[3], ub[3], f); v.z = lerp(ua[4], ub[4], f);
      v.rot = lerpAngle(ua[5], ub[5], f);
      if (ub[6] < v.hp - 1) v.flash = 0.08;
      v.hp = ub[6]; v.maxHp = ub[7]; v.flags = ub[8];
      v.vx = span > 0 ? (ub[3] - ua[3]) / span : 0;
      v.vz = span > 0 ? (ub[4] - ua[4]) / span : 0;
      v.missing = 0;
    }
    // units gone from the newest snapshot -> corpse
    for (const v of this.units.values()) {
      if (!b.mmap.has(v.id) && v.deadAt < 0) {
        v.missing = (v.missing || 0) + 1;
        if (v.missing > 1) v.deadAt = this.now;
      }
    }
  }

  processEvents() {
    if (this.clock == null) return;
    const q = this.evq;
    let i = 0;
    while (i < q.length && q[i].t <= this.clock + 0.0001) { this.onEvent(q[i].ev); i++; }
    if (i) q.splice(0, i);
    if (q.length > 600) q.splice(0, q.length - 600);
  }

  ent(id) { return this.heroes.get(id) || this.units.get(id) || this.structs.get(id) || null; }
  posOf(id) {
    const e = this.ent(id);
    if (!e) return null;
    if (e.y == null || Number.isNaN(e.y)) e.y = heightAt(e.x, e.z);
    return e;
  }

  onEvent(ev) {
    const A = this.audio, V = this.vfx;
    const me = this.me;
    const isMe = (id) => me && id === me.id;
    switch (ev.e) {
      case 'proj': {
        V.addProj(ev);
        if (isMe(ev.o)) break;
        const v = ev.v;
        const o = this.ent(ev.o);
        const x = o ? o.x : ev.x, z = o ? o.z : ev.z;
        if (v.startsWith('tower')) A.play('tower', x, z);
        else if (v === 'fireball') A.play('fire', x, z);
        else if (v === 'arrow' || v === 'bigArrow' || v === 'hunterArrow') A.play('bow', x, z, v === 'hunterArrow' ? 2 : 0.8);
        else if (o && o.def) A.play('shoot', x, z, 0.7);
        break;
      }
      case 'pend': V.endProj(ev); break;
      case 'tele': V.tele(ev); break;
      case 'fx': {
        V.fx(ev);
        const s = FX_SFX[ev.v];
        if (s) A.play(s, ev.x, ev.z);
        if (ev.v === 'hit' && ev.s === this.myId) { A.play('hit'); this.addShake(0.08); }
        break;
      }
      case 'atk': {
        const e = this.ent(ev.i);
        if (!e || isMe(ev.i)) break;
        e.atkStart = this.now; e.atkDur = Math.max(0.2, (ev.w || 0.25) * 2); e.atkN = (e.atkN || 0) + 1;
        if (e.def) {
          A.play(e.def.ranged ? 'shoot' : 'swing', e.x, e.z, 0.6);
          if (!e.def.ranged) {
            const yaw = Math.atan2(ev.x - e.x, ev.z - e.z), flip = e.atkN % 2 === 0;
            setTimeout(() => this.vfx.slash(e, yaw, SLASH_COL[e.def.id] || [1, 1, 1], e.def.id === 'brakka' ? 1.3 : 1, flip), (ev.w || 0.25) * 1000);
          }
        }
        break;
      }
      case 'cast': {
        const e = this.ent(ev.i);
        if (!e) break;
        if (!isMe(ev.i)) { e.castStart = this.now; e.castSlot = ev.s; }
        if (e.def) { const s = CAST_SFX[e.def.id]?.[{ q: 0, e: 1, r: 2 }[ev.s]]; if (s) A.play(s, e.x, e.z); }
        else if (e.castStart !== undefined) { e.castStart = this.now; }
        break;
      }
      case 'dmg': {
        const t = this.ent(ev.i);
        if (!t) break;
        t.flash = 0.1;
        if (ev.s === this.myId || ev.i === this.myId) {
          const p = PROJ;
          projectPoint(this.R.vp, t.x, (t.y || 0) + 2.6, t.z, this.R.canvas.clientWidth, this.R.canvas.clientHeight, p);
          if (p.visible) this.hud.floatText(p.x, p.y, ev.a, ev.i === this.myId ? 'dmg-in' : ev.y === 1 ? 'dmg-magic' : ev.y === 2 ? 'dmg-true' : 'dmg-phys', ev.a > 250);
          if (ev.i === this.myId) { this.hud.hurt(Math.min(1, ev.a / (me.maxHp * 0.15))); }
          if (ev.s === this.myId && t.def) A.play('hit', t.x, t.z);
        }
        break;
      }
      case 'heal': {
        const t = this.ent(ev.i);
        if (!t || !(ev.i === this.myId || (t.team === this.myTeam && t.def))) break;
        const p = PROJ;
        projectPoint(this.R.vp, t.x, (t.y || 0) + 2.6, t.z, this.R.canvas.clientWidth, this.R.canvas.clientHeight, p);
        if (p.visible && ev.a > 4) this.hud.floatText(p.x, p.y, '+' + ev.a, 'heal');
        break;
      }
      case 'death': {
        const e = this.ent(ev.i);
        if (!e) break;
        if (e.def) {
          A.play('death', e.x, e.z);
          V.deathBurst(e, true);
        } else if (e.kind !== undefined && this.units.has(ev.i)) {
          if (e.deadAt < 0) e.deadAt = this.now;
          A.play('minionDeath', e.x, e.z, 0.6);
          V.deathBurst(e, e.kind >= K.WOLF);
        }
        break;
      }
      case 'kill': {
        this.hud.killfeed(this.ent(ev.k), this.ent(ev.v), ev.as.map((a) => this.ent(a)).filter(Boolean), this);
        if (ev.v === this.myId) { this.hud.toast('You have been slain', 'bad'); }
        if (ev.k === this.myId) { this.addShake(0.3); A.play('announce'); }
        break;
      }
      case 'lvl': {
        const e = this.ent(ev.i);
        if (e) V.levelUp(e);
        if (isMe(ev.i)) { A.play('level'); this.hud.levelUp(ev.l); }
        break;
      }
      case 'ult': if (isMe(ev.i)) this.hud.toast('Ultimate unlocked!', 'good'); break;
      case 'gold': {
        if (!isMe(ev.i)) break;
        A.play('gold');
        const p = PROJ;
        projectPoint(this.R.vp, ev.x, heightAt(ev.x, ev.z) + 2, ev.z, this.R.canvas.clientWidth, this.R.canvas.clientHeight, p);
        if (p.visible) this.hud.floatText(p.x, p.y, '+' + ev.a + 'g', 'gold');
        break;
      }
      case 'ann': {
        const good = ev.tm === -1 ? null : ev.tm === this.myTeam;
        this.hud.announce(ev.t, good, ev.k, this.ent(ev.w));
        if (ev.k !== 'victory') A.play(good === false ? 'bad' : 'announce');
        break;
      }
      case 'struct': {
        const s = this.structs.get(ev.i);
        if (s) { s.dead = true; s.solid = false; s.deadAt = this.now; V.structureDown(s.x, s.z, s.team); A.play('structure', s.x, s.z, 2); }
        break;
      }
      case 'over': {
        this.over = true;
        const win = ev.w === this.myTeam;
        setTimeout(() => { A.play(win ? 'victory' : 'defeat'); this.hud.endScreen(win, this); }, 2600);
        break;
      }
      case 'dash': {
        const e = this.ent(ev.i);
        if (!e) break;
        e.dashUntil = this.now + ev.d;
        if (ev.a) e.arc = { start: this.now, d: ev.d, h: ev.a };
        if (e.def) A.play('dash', e.x, e.z, 0.7);
        break;
      }
      case 'blink': {
        V.blink(ev.x0, ev.z0, ev.x1, ev.z1, this.ent(ev.i)?.def?.id === 'vex' ? COL.red : COL.arcane);
        A.play('blink', ev.x1, ev.z1);
        const e = this.ent(ev.i);
        if (e) { e.x = ev.x1; e.z = ev.z1; }
        if (isMe(ev.i)) { this.pred.x = ev.x1; this.pred.z = ev.z1; this.pred.ox = 0; this.pred.oz = 0; this.pred.hist.length = 0; }
        break;
      }
      case 'recall': {
        const e = this.ent(ev.i);
        if (!e) break;
        e.recall = ev.s === 1;
        if (ev.s === 1) { if (isMe(ev.i)) A.play('recall'); }
        if (ev.s === 2) V.recallDone(e, e.team);
        break;
      }
      case 'tp': {
        if (isMe(ev.i)) { this.pred.x = ev.x; this.pred.z = ev.z; this.pred.ox = 0; this.pred.oz = 0; this.pred.hist.length = 0; }
        break;
      }
      case 'spawn': {
        const e = this.ent(ev.i);
        if (e) { V.respawn({ x: ev.x, y: heightAt(ev.x, ev.z), z: ev.z }, e.team); }
        if (isMe(ev.i)) { this.pred.x = ev.x; this.pred.z = ev.z; this.pred.ox = this.pred.oz = 0; this.pred.hist.length = 0; this.hud.respawned(); }
        break;
      }
      case 'buy': if (isMe(ev.i)) { A.play('buy'); this.hud.bought(ev.it); } break;
    }
  }

  // ---------------------------------------------------------------- views
  updateViews(dt) {
    for (const v of this.heroes.values()) this.updateMover(v, dt);
    for (const [id, v] of this.units) {
      this.updateMover(v, dt);
      if (v.deadAt >= 0 && this.now - v.deadAt > 1.4) this.units.delete(id);
    }
    for (const s of this.structs.values()) s.flash = Math.max(0, s.flash - dt);
  }

  updateMover(v, dt) {
    const gy = heightAt(v.x, v.z);
    let y = gy;
    if (v.arc) {
      const k = (this.now - v.arc.start) / v.arc.d;
      if (k >= 1) v.arc = null; else y += Math.sin(k * Math.PI) * v.arc.h;
    }
    if (v.flags & F.AIRBORNE) {
      v.airT = (v.airT || 0) + dt;
      y += Math.sin(Math.min(1, v.airT / 0.8) * Math.PI) * 1.6;
    } else v.airT = 0;
    v.y = y;
    const dx = v.lastX == null ? 0 : v.x - v.lastX, dz = v.lastZ == null ? 0 : v.z - v.lastZ;
    v.lastX = v.x; v.lastZ = v.z;
    const sp = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    const norm = clamp(sp / (v.def ? 7.5 : 6), 0, 1.3);
    v.speed = lerp(v.speed, sp > 0.4 && sp < 40 ? Math.min(1, norm) : 0, Math.min(1, dt * 10));
    v.phase += sp < 40 ? sp * dt * (v.def ? 1.25 : 1.6) : 0;
    v.flash = Math.max(0, v.flash - dt);
    if (v.def && (v.dashUntil > this.now || (v.flags & F.DASH))) {
      if (Math.random() < 0.8) this.vfx.dashTrail(v, v.def.id === 'vex' ? COL.red : hex(v.def.palette.accent));
    }
  }

  // ---------------------------------------------------------------- camera
  addShake(a) { this.shake = Math.min(1.2, this.shake + a * (this.settings.shake === false ? 0 : 1)); }

  updateCamera(dt) {
    const cam = this.cam;
    const me = this.me;
    if (me) {
      const ty = (me.y || heightAt(me.x, me.z)) + 2.1;
      const k = 1 - Math.exp(-dt * 18);
      cam.x = lerp(cam.x, me.x, k); cam.z = lerp(cam.z, me.z, k); cam.y = lerp(cam.y, ty, 1 - Math.exp(-dt * 8));
    }
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
    const rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
    const shoulder = this.input.touch ? 0 : 0.9;
    const tx = cam.x + rx * shoulder, tz = cam.z + rz * shoulder;
    const ch = Math.cos(cam.pitch), sh = Math.sin(cam.pitch);
    // pull the camera in front of rocks, trees and towers between it and the hero
    const want = this.cameraClearance(tx, tz, cam.y, -fx * ch, -fz * ch, sh, cam.dist);
    cam.cur = cam.cur == null ? want : want < cam.cur ? lerp(cam.cur, want, 1 - Math.exp(-dt * 25)) : lerp(cam.cur, want, 1 - Math.exp(-dt * 3));
    const dist = cam.cur;
    let ex = tx - fx * dist * ch, ez = tz - fz * dist * ch, ey = cam.y + dist * sh + 0.8;
    const minY = heightAt(ex, ez) + 1.2;
    if (ey < minY) ey = minY;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    const s = this.shake * this.shake * 0.6;
    const t = this.now * 40;
    ex += Math.sin(t * 1.3) * s; ey += Math.sin(t * 1.7 + 1) * s; ez += Math.cos(t * 1.1) * s;
    const look = [tx + fx * 6, cam.y + 0.6, tz + fz * 6];
    const meDead = me && (me.flags & F.DEAD);
    this.R.setCamera([ex, ey, ez], look, this.settings.fov || 62);
    // death desaturation / tint
    this.R.tintAmt = lerp(this.R.tintAmt, meDead ? 0.45 : this.hud.hurtAmt * 0.25, Math.min(1, dt * 6));
    this.R.tint = meDead ? [0.12, 0.12, 0.16] : [0.6, 0.05, 0.05];
  }

  cameraClearance(tx, tz, ty, dx, dz, dy, dist) {
    // horizontal ray from the look target back toward the camera
    const hl = Math.hypot(dx, dz) || 1;
    const ux = dx / hl, uz = dz / hl;
    const reach = dist * hl;
    let best = dist;
    const test = (cx, cz, r, top) => {
      const ox = cx - tx, oz = cz - tz;
      const along = ox * ux + oz * uz;
      if (along < -r || along > reach + r) return;
      const perp2 = ox * ox + oz * oz - along * along;
      if (perp2 > r * r) return;
      const s0 = along - Math.sqrt(r * r - perp2);
      if (s0 <= 0.3) return;
      const d = s0 / hl;
      const yAt = ty + 0.8 + dy * d;
      if (yAt > heightAt(cx, cz) + top) return;
      best = Math.min(best, Math.max(2.5, d - 0.4));
    };
    for (const o of OBSTACLES) {
      if (Math.abs(o.x - tx) > dist + 8 || Math.abs(o.z - tz) > dist + 8) continue;
      test(o.x, o.z, o.r + (o.kind === 'rock' ? 0.8 : 1.6), o.kind === 'rock' ? o.r * 1.5 : 8.5);
    }
    for (const s of this.structs.values()) if (!s.dead) test(s.x, s.z, s.kind === K.SPIRE ? 4 : 2.4, s.kind === K.SPIRE ? 14 : 10);
    return best;
  }

  // ---------------------------------------------------------------- draw
  drawWorld() {
    const R = this.R;
    const t = this.now;
    const camx = this.cam.x, camz = this.cam.z;
    const cull = (x, z, r = 0) => (x - camx) ** 2 + (z - camz) ** 2 > (150 + r) ** 2;
    // structures
    for (const s of this.structs.values()) {
      if (cull(s.x, s.z, 20)) continue;
      const m = s.model;
      if (s.dead) {
        drawRubble(R, s, t - s.deadAt);
        continue;
      }
      animateUnit(m, { t: t + s.id, speed: 0, phase: 0, atk: -1, dead: -1 });
      const gy = heightAt(s.x, s.z);
      mat4.compose(ROOT, s.x, gy, s.z, 0, 0, 0, 1, 1, 1);
      m.rig.draw(R, ROOT, { flash: s.flash > 0 ? 0.35 : 0 });
      if ((s.flags & F.INVULN) && s.kind === K.TOWER) {
        // protected tower: faint rune ring at its base
        R.decal(5, s.x, gy + 0.12, s.z, t * 0.4, 6.5, 6.5, s.team === this.myTeam ? [0.5, 0.8, 1] : [1, 0.6, 0.4], 0.35);
      }
      // tower range warning when an enemy tower is close
      if (s.kind === K.TOWER && s.team !== this.myTeam && this.me && !(this.me.flags & F.DEAD)) {
        const d = Math.hypot(this.me.x - s.x, this.me.z - s.z);
        if (d < 20) R.decal(0, s.x, gy + 0.1, s.z, 0, 28.4, 28.4, [1, 0.3, 0.3], clamp((20 - d) / 6, 0, 0.8));
      }
      R.sprite(s.x, gy + 0.05, s.z, s.kind === K.SPIRE ? 6 : 3.5, 0, 0, 0, 0.45, 5, 0, 0, 1);
    }
    // units
    for (const v of this.units.values()) {
      if (cull(v.x, v.z)) continue;
      const dead = v.deadAt >= 0 ? this.now - v.deadAt : -1;
      const atk = v.atkStart > 0 && this.now - v.atkStart < v.atkDur ? (this.now - v.atkStart) / v.atkDur : -1;
      const cast = v.castStart > 0 && this.now - v.castStart < 1.2 ? (this.now - v.castStart) / 1.2 : -1;
      animateUnit(v.model, { t: t + v.id * 0.37, speed: v.speed, phase: v.phase, atk, cast, dead });
      const sc = v.model.scale;
      mat4.compose(ROOT, v.x, v.y, v.z, 0, v.rot, 0, sc, sc, sc);
      const alpha = dead > 0.8 ? Math.max(0, 1 - (dead - 0.8) / 0.6) : (v.flags & F.INVULN) && v.kind >= K.WOLF ? 0.55 : 1;
      v.model.rig.draw(R, ROOT, { flash: v.flash > 0 ? 0.6 : 0, alpha, tint: [0.6, 0.85, 1], tintAmt: v.flags & F.CHILL ? 0.35 : 0 });
      R.sprite(v.x, v.y + 0.05, v.z, (v.radius || 0.6) * 1.8 * sc, 0, 0, 0, 0.4 * alpha, 5, 0, 0, 1);
      if (v.flags & F.STUN) this.drawStun(v, 1.6 * sc);
    }
    // heroes
    for (const v of this.heroes.values()) {
      if (cull(v.x, v.z)) continue;
      const isMe = v === this.me;
      const dead = v.flags & F.DEAD ? (v.deadAt >= 0 ? this.now - v.deadAt : 2) : -1;
      if (dead > 3.5) continue;
      const atk = this.now - v.atkStart < v.atkDur ? (this.now - v.atkStart) / v.atkDur : -1;
      const castDur = v.castSlot === 'r' ? 0.75 : 0.45;
      const cast = this.now - v.castStart < castDur ? (this.now - v.castStart) / castDur : -1;
      animateHero(v.model, {
        t: t + v.id, speed: v.speed, phase: v.phase, atk, atkN: v.atkN, cast, slot: v.castSlot,
        dash: v.dashUntil > this.now || !!(v.flags & F.DASH), stun: !!(v.flags & F.STUN), dead, recall: !!(v.flags & F.RECALL),
        channel: !!(v.flags & F.CHANNEL) && v.def.id === 'ignis',
      });
      let sc = v.model.scale;
      if (v.flags & F.RAGE) sc *= 1.25;
      const stealth = v.flags & F.STEALTH;
      let alpha = stealth ? (v.team === this.myTeam ? 0.45 : 0.12) : 1;
      if (dead > 2) alpha = Math.max(0, 1 - (dead - 2) / 1.5);
      const spin = v.flags & F.AIRBORNE ? (v.airT || 0) * 9 : 0;
      mat4.compose(ROOT, v.x, v.y - (dead > 0 ? Math.min(0.4, dead * 0.2) : 0), v.z, 0, v.rot + spin, 0, sc, sc, sc);
      const chill = v.flags & F.CHILL, burn = v.flags & F.BURN;
      v.model.rig.draw(R, ROOT, {
        flash: v.flash > 0 ? 0.55 : 0, alpha, emissiveBoost: Math.sin(t * 4) * 0.3,
        tint: chill ? [0.6, 0.85, 1] : burn ? [1, 0.45, 0.2] : [1, 1, 1], tintAmt: chill ? 0.4 : burn ? 0.18 + Math.sin(t * 12) * 0.08 : 0,
      });
      if (dead >= 0) continue;
      // team ring + shadow
      const ringCol = isMe ? [0.4, 1, 0.55] : v.team === this.myTeam ? [0.35, 0.7, 1] : [1, 0.25, 0.3];
      if (!stealth || v.team === this.myTeam) R.decal(5, v.x, v.y + 0.08, v.z, t * 0.5, 2.6 * sc, 2.6 * sc, ringCol, isMe ? 0.9 : 0.75);
      R.sprite(v.x, v.y + 0.05, v.z, 1.5 * sc, 0, 0, 0, 0.45 * alpha, 5, 0, 0, 1);
      if (v.flags & F.STUN) this.drawStun(v, 2.6 * sc);
      if (v.flags & F.ROOT) R.decal(4, v.x, v.y + 0.1, v.z, t, 2.2, 2.2, [0.5, 1, 0.6], 0.8);
      if (v.flags & F.EMPOWER) R.sprite(v.x, v.y + 1.2, v.z, 3.2, 0.7, 0.45, 1, 0.25, 0, 1);
      if (v.flags & F.RECALL) {
        const c = v.team ? [1, 0.6, 0.4] : [0.5, 0.8, 1];
        R.decal(1, v.x, v.y + 0.1, v.z, 0, 4, 4, c, 0.8, (t * 0.6) % 1);
        if (Math.random() < 0.5) this.vfx.spawn({ x: v.x + (Math.random() - 0.5) * 2, y: v.y + 0.2, z: v.z + (Math.random() - 0.5) * 2, vy: 3, life: 0.8, size: 0.35, c });
      }
      // ambient aura particles per champion
      if (!stealth && Math.random() < 0.35) this.aura(v);
    }
    this.drawAimIndicator();
    this.vfx.draw();
  }

  drawStun(v, h) {
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i / 3) * Math.PI * 2;
      this.R.sprite(v.x + Math.cos(a) * 0.55, v.y + h, v.z + Math.sin(a) * 0.55, 0.35, 1, 0.9, 0.4, 1, 2, 1, t * 3);
    }
  }

  aura(v) {
    const id = v.def.id;
    const col = { lyra: COL.cyan, vex: [0.3, 0.05, 0.12], mordrin: COL.green, aurelia: COL.holy, zephyr: COL.wind, ignis: COL.fire, rime: COL.ice }[id];
    if (!col) return;
    const add = id === 'vex' ? 0 : 1;
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * 0.6;
    this.vfx.spawn({
      x: v.x + Math.cos(a) * r, y: v.y + 0.4 + Math.random() * 1.8, z: v.z + Math.sin(a) * r,
      vy: id === 'ignis' ? 1.8 : id === 'rime' ? -0.6 : 0.6, life: 0.9, size: id === 'vex' ? 0.6 : 0.25, c: col, add, shape: id === 'aurelia' || id === 'lyra' ? 2 : 0, a: 0.8,
    });
  }

  drawAimIndicator() {
    const me = this.me;
    if (!me || (me.flags & F.DEAD)) return;
    const R = this.R;
    const aiming = this.input.aiming;
    const gy = heightAt(me.x, me.z) + 0.12;
    if (!aiming) {
      // subtle crosshair ground marker on desktop
      if (!this.input.touch) {
        const [ax, az] = this.aimPoint();
        R.decal(4, ax, heightAt(ax, az) + 0.1, az, this.now, 1.2, 1.2, [1, 1, 1], 0.35);
      }
      return;
    }
    const spec = me.def[aiming.slot];
    if (!spec) return;
    const ready = this.meData && this.meData.cd[{ q: 0, e: 1, r: 2 }[aiming.slot]] <= 0.05;
    const col = ready ? [0.45, 0.85, 1] : [1, 0.35, 0.35];
    const quick = aiming.source === 'touch' && (!aiming.drag || aiming.drag.len < 0.18);
    const [ax, az] = this.aimFor(aiming.slot, aiming.drag, quick, aiming.source === 'touch' ? 'touch' : 'key');
    let dx = ax - me.x, dz = az - me.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const ang = Math.atan2(dx, dz);
    const range = spec.range || spec.radius || 8;
    if (me.def.id === 'sylva' && aiming.slot === 'e') {
      R.decal(3, me.x, gy, me.z, ang, range * 2, range * 2, col, 0.8, 0, spec.spread / 2);
    } else if (spec.aim === 'dir') {
      const w = spec.width || (spec.radius ? spec.radius * 2 : 1.6);
      R.decal(2, me.x + dx * range / 2, gy, me.z + dz * range / 2, ang, Math.max(1.2, w), range, col, 0.85, 0, Math.max(2, range / 3));
      if (spec.radius && me.def.id === 'ignis' && aiming.slot === 'q') R.decal(0, me.x + dx * range, gy, me.z + dz * range, 0, spec.radius * 2, spec.radius * 2, col, 0.6);
    } else if (spec.aim === 'point') {
      R.decal(0, me.x, gy, me.z, 0, range * 2, range * 2, col, 0.55);
      const r = spec.radius || 2;
      R.decal(4, ax, heightAt(ax, az) + 0.12, az, this.now, r * 2, r * 2, col, 0.9);
    } else if (spec.aim === 'self') {
      R.decal(0, me.x, gy, me.z, 0, (spec.radius || 4) * 2, (spec.radius || 4) * 2, col, 0.75);
    } else if (spec.aim === 'unit') {
      R.decal(0, me.x, gy, me.z, 0, range * 2, range * 2, col, 0.55);
      const tgt = this.autoTarget(range + 1, 0.6);
      if (tgt) R.decal(5, tgt.x, tgt.y + 0.1, tgt.z, this.now * 3, 3, 3, [1, 0.2, 0.3], 1);
    }
  }

  // ---------------------------------------------------------------- HUD data helpers
  xpProgress() {
    const d = this.meData;
    if (!d) return 0;
    if (d.lv >= MAX_LEVEL) return 1;
    const a = XP_TABLE[d.lv - 1], b = XP_TABLE[d.lv];
    return clamp((d.xp - a) / (b - a), 0, 1);
  }
  inShopRange() {
    if (!this.me) return false;
    const [fx, fz] = FOUNTAIN_POS[this.myTeam];
    return Math.hypot(this.me.x - fx, this.me.z - fz) < SHOP_RADIUS || !!(this.me.flags & F.DEAD);
  }
}

function unitRadius(kind, variant) {
  switch (kind) {
    case K.SIEGE: return 0.95;
    case K.CASTER: return 0.55;
    case K.WOLF: return variant ? 0.7 : 1.0;
    case K.GOLEM: return 1.6;
    case K.RAPTOR: return variant ? 0.6 : 0.9;
    case K.DRAKE: return 2.6;
    case K.WARDEN: return 3.2;
    default: return 0.65;
  }
}

const RUBBLE = mat4.create();
function drawRubble(R, s, age) {
  const gy = heightAt(s.x, s.z);
  const n = s.kind === K.SPIRE ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + s.id;
    const d = 1 + (i % 3) * 0.8;
    const sz = s.kind === K.SPIRE ? 2.4 : 1.4;
    mat4.compose(RUBBLE, s.x + Math.cos(a) * d, gy + 0.4, s.z + Math.sin(a) * d, a, a * 2, 0, sz, sz * 0.7, sz);
    R.push('rock', RUBBLE, [0.6, 0.57, 0.52], 1, 0, sz, sz * 0.7, sz, true);
  }
  mat4.compose(RUBBLE, s.x, gy + 0.5, s.z, 0, 0, 0, 3.6, 1, 3.6);
  R.push('cyl', RUBBLE, [0.45, 0.43, 0.4], 1, 0, 3.6, 1, 3.6, true);
  if (age < 6 && Math.random() < 0.3) R.sprite(s.x + (Math.random() - 0.5) * 3, gy + 1 + Math.random() * 2, s.z + (Math.random() - 0.5) * 3, 2, 0.3, 0.3, 0.3, 0.3, 4, 0);
}
