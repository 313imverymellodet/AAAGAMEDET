// Ability implementations for all ten champions.
// Each fn(w, h, a) where a = { dx, dz, ax, az, dist, spec }. Return false to abort (no cooldown).
import { K } from '../constants.js';
import { abilityValue } from '../heroes.js';
import { resolveStatic } from '../map.js';
import { dist2, segDist2 } from '../math.js';
import { WRAITH_STATS } from './units.js';

const V = (spec, h) => abilityValue(spec, h);
const groundPoint = (h, a, range) => {
  const d = Math.min(Math.max(a.dist, 0), range);
  return [h.x + a.dx * d, h.z + a.dz * d];
};
const r2 = (v) => +v.toFixed(2);
const heroesFirst = (list) => list.sort((a, b) => (b.kind === K.HERO) - (a.kind === K.HERO));

function dashHits(w, h, spec, radius, onHit) {
  return (w2, e, d) => {
    for (const t of w2.enemiesNear(h.team, e.x, e.z, radius)) {
      if (d.hit.has(t.id)) continue;
      d.hit.add(t.id);
      onHit(t);
    }
  };
}

export const ABILITIES = {
  // ------------------------------------------------------------ KAELEN
  kaelen: {
    q(w, h, a) {
      const s = a.spec;
      const tx = h.x + a.dx * s.range, tz = h.z + a.dz * s.range;
      w.startDash(h, tx, tz, 0.32, {
        onTick: (w2, e, d) => {
          const hits = heroesFirst(w2.enemiesNear(h.team, e.x + a.dx * 0.6, e.z + a.dz * 0.6, s.width / 2 + 0.2));
          if (!hits.length) return;
          const t = hits[0];
          w2.damage(h, t, V(s, h), 'phys', { ability: true });
          w2.applyCC(t, 'stun', s.stun, h);
          w2.emit({ e: 'fx', v: 'bash', x: r2(t.x), z: r2(t.z), i: t.id });
          e.dash = null;
        },
      });
    },
    e(w, h, a) {
      const s = a.spec;
      w.addShield(h, V(s, h) + s.hpPct * h.maxHp, s.dur, h);
      for (const t of w.enemiesNear(h.team, h.x, h.z, s.radius)) w.applyCC(t, 'slow', 1.5, h, s.slow);
      w.emit({ e: 'fx', v: 'bulwark', x: r2(h.x), z: r2(h.z), r: s.radius, i: h.id, d: s.dur });
    },
    r(w, h, a) {
      const s = a.spec;
      let [tx, tz] = groundPoint(h, a, s.range);
      [tx, tz] = resolveStatic(tx, tz, h.radius, w.structs);
      const dur = 0.6;
      w.emit({ e: 'tele', sh: 'circle', x: r2(tx), z: r2(tz), r: s.radius, d: dur, tm: h.team });
      w.startDash(h, tx, tz, dur, {
        ignoreWalls: true, arc: 5,
        onEnd: (w2, e) => {
          w2.emit({ e: 'fx', v: 'quake', x: r2(e.x), z: r2(e.z), r: s.radius, i: h.id });
          for (const t of w2.enemiesNear(h.team, e.x, e.z, s.radius)) {
            w2.damage(h, t, V(s, h), 'phys', { ability: true });
            w2.applyCC(t, 'airborne', s.knock, h);
          }
        },
      });
    },
  },

  // ------------------------------------------------------------ LYRA
  lyra: {
    q(w, h, a) {
      const s = a.spec;
      w.spawnProj({
        owner: h, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, width: s.width, vis: 'arcaneBolt',
        onHit: (w2, p, t) => { w2.damage(h, t, V(s, h), 'magic', { ability: true }); w2.emit({ e: 'fx', v: 'arcaneHit', x: r2(t.x), z: r2(t.z) }); },
      });
    },
    e(w, h, a) {
      const s = a.spec;
      const ox = h.x, oz = h.z;
      let [tx, tz] = resolveStatic(h.x + a.dx * s.range, h.z + a.dz * s.range, h.radius, w.structs);
      h.x = tx; h.z = tz;
      h.wind = null;
      w.emit({ e: 'blink', i: h.id, x0: r2(ox), z0: r2(oz), x1: r2(tx), z1: r2(tz) });
      w.emit({ e: 'fx', v: 'stardust', x: r2(ox), z: r2(oz), r: s.radius });
      for (const t of w.enemiesNear(h.team, ox, oz, s.radius)) w.damage(h, t, V(s, h), 'magic', { ability: true });
    },
    r(w, h, a) {
      const s = a.spec;
      const [tx, tz] = groundPoint(h, a, s.range);
      w.emit({ e: 'tele', sh: 'circle', x: r2(tx), z: r2(tz), r: s.radius, d: s.delay, tm: h.team });
      w.emit({ e: 'fx', v: 'starfallCall', x: r2(tx), z: r2(tz), r: s.radius, d: s.delay });
      w.after(s.delay, (w2) => {
        w2.emit({ e: 'fx', v: 'starfall', x: r2(tx), z: r2(tz), r: s.radius });
        for (const t of w2.enemiesNear(h.team, tx, tz, s.radius)) {
          w2.damage(h, t, V(s, h), 'magic', { ability: true });
          w2.applyCC(t, 'slow', 1.5, h, s.slow);
        }
      });
    },
  },

  // ------------------------------------------------------------ VEX
  vex: {
    q(w, h, a) {
      const s = a.spec;
      w.startDash(h, h.x + a.dx * s.range, h.z + a.dz * s.range, 0.22, {
        onTick: dashHits(w, h, s, s.width / 2 + 0.2, (t) => {
          w.damage(h, t, V(s, h), 'phys', { ability: true });
          w.emit({ e: 'fx', v: 'shadowCut', x: r2(t.x), z: r2(t.z), i: t.id });
        }),
      });
    },
    e(w, h, a) {
      const s = a.spec;
      w.addEffect(h, 'stealth', s.dur);
      w.addEffect(h, 'haste', s.dur, s.haste);
      h.veilEmpower = true;
      w.emit({ e: 'fx', v: 'veil', x: r2(h.x), z: r2(h.z), i: h.id });
    },
    r(w, h, a) {
      const s = a.spec;
      const t = w.assistTarget(h, a.dx, a.dz, s.range, 0.55, { structs: false, heroesFirst: true });
      if (!t || t.kind !== K.HERO) return false;
      const dx = t.x - h.x, dz = t.z - h.z;
      const d = Math.hypot(dx, dz) || 1;
      const ox = h.x, oz = h.z;
      let [nx, nz] = resolveStatic(t.x + (dx / d) * (t.radius + 1.2), t.z + (dz / d) * (t.radius + 1.2), h.radius, w.structs);
      h.x = nx; h.z = nz;
      h.rot = Math.atan2(t.x - nx, t.z - nz);
      w.emit({ e: 'blink', i: h.id, x0: r2(ox), z0: r2(oz), x1: r2(nx), z1: r2(nz) });
      w.emit({ e: 'fx', v: 'deathmark', x: r2(t.x), z: r2(t.z), i: t.id });
      w.after(0.12, (w2) => {
        if (h.dead || t.dead) return;
        w2.damage(h, t, V(s, h) + s.missing * (t.maxHp - t.hp), 'phys', { ability: true });
      });
    },
  },

  // ------------------------------------------------------------ BRAKKA
  brakka: {
    q(w, h, a) {
      const s = a.spec;
      w.emit({ e: 'fx', v: 'cleave', x: r2(h.x), z: r2(h.z), r: s.radius, i: h.id });
      let heroes = 0;
      for (const t of w.enemiesNear(h.team, h.x, h.z, s.radius)) {
        w.damage(h, t, V(s, h), 'phys', { ability: true });
        if (t.kind === K.HERO) heroes++;
      }
      if (heroes) w.heal(h, h, (h.maxHp - h.hp) * s.healMissing * heroes);
    },
    e(w, h, a) {
      const s = a.spec;
      w.emit({ e: 'fx', v: 'fissure', x: r2(h.x), z: r2(h.z), a: r2(Math.atan2(a.dx, a.dz)), l: s.range, r: s.width / 2 });
      for (const t of w.enemiesInLine(h.team, h.x, h.z, a.dx, a.dz, s.range, s.width)) {
        w.damage(h, t, V(s, h), 'phys', { ability: true });
        w.applyCC(t, 'slow', 1.5, h, s.slow);
      }
    },
    r(w, h, a) {
      const s = a.spec;
      w.clearEff(h, ['stun', 'root', 'slow', 'chill', 'airborne']);
      w.addEffect(h, 'unstoppable', 2);
      w.addEffect(h, 'rage', s.dur);
      w.addEffect(h, 'as', s.dur, s.as);
      w.addEffect(h, 'haste', s.dur, s.haste);
      w.addEffect(h, 'dr', s.dur, s.dr);
      w.emit({ e: 'fx', v: 'rage', x: r2(h.x), z: r2(h.z), i: h.id, d: s.dur });
    },
  },

  // ------------------------------------------------------------ SYLVA
  sylva: {
    q(w, h, a) {
      const s = a.spec;
      w.spawnProj({
        owner: h, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, width: s.width, pierce: true, vis: 'bigArrow',
        onHit: (w2, p, t) => w2.damage(h, t, V(s, h), 'phys', { ability: true }),
      });
    },
    e(w, h, a) {
      const s = a.spec;
      const shared = new Set();
      const base = Math.atan2(a.dx, a.dz);
      for (let i = 0; i < s.arrows; i++) {
        const ang = base + (i / (s.arrows - 1) - 0.5) * s.spread;
        w.spawnProj({
          owner: h, dx: Math.sin(ang), dz: Math.cos(ang), speed: 46, range: s.range, width: 0.7, vis: 'arrow', hitSet: shared,
          onHit: (w2, p, t) => w2.damage(h, t, V(s, h), 'phys', { ability: true }),
        });
      }
      w.startDash(h, h.x - a.dx * s.back, h.z - a.dz * s.back, 0.25);
      h.rot = base;
    },
    r(w, h, a) {
      const s = a.spec;
      w.spawnProj({
        owner: h, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, width: s.width, heroesOnly: true, vis: 'hunterArrow',
        onHit: (w2, p, t) => {
          const stun = 1 + 2 * Math.min(1, p.traveled / 40);
          w2.damage(h, t, V(s, h), 'phys', { ability: true });
          w2.applyCC(t, 'stun', stun, h);
          w2.emit({ e: 'fx', v: 'bigHit', x: r2(t.x), z: r2(t.z), i: t.id });
        },
      });
    },
  },

  // ------------------------------------------------------------ MORDRIN
  mordrin: {
    q(w, h, a) {
      const s = a.spec;
      w.spawnProj({
        owner: h, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, width: s.width, vis: 'bone',
        onHit: (w2, p, t) => {
          w2.damage(h, t, V(s, h), 'magic', { ability: true });
          w2.applyCC(t, 'root', s.root, h);
          w2.emit({ e: 'fx', v: 'rootFx', x: r2(t.x), z: r2(t.z), i: t.id, d: s.root });
        },
      });
    },
    e(w, h, a) {
      const s = a.spec;
      const [tx, tz] = groundPoint(h, a, s.range);
      w.emit({ e: 'fx', v: 'mire', x: r2(tx), z: r2(tz), r: s.radius, d: s.dur });
      w.spawnZone({
        x: tx, z: tz, dur: s.dur, every: 0.5, firstDelay: 0.1,
        onTick: (w2, zn) => {
          for (const t of w2.enemiesNear(h.team, zn.x, zn.z, s.radius)) {
            w2.damage(h, t, V(s, h), 'magic', { ability: true });
            w2.applyCC(t, 'slow', 0.6, h, s.slow);
          }
        },
      });
    },
    r(w, h, a) {
      const s = a.spec;
      const [tx, tz] = groundPoint(h, a, s.range);
      w.emit({ e: 'fx', v: 'raise', x: r2(tx), z: r2(tz), r: s.radius });
      for (let i = 0; i < s.count; i++) {
        const ang = (i / s.count) * Math.PI * 2;
        let [x, z] = resolveStatic(tx + Math.cos(ang) * 1.6, tz + Math.sin(ang) * 1.6, 0.6, w.structs);
        const hp = 380 + 45 * (h.level - 1);
        w.addUnit(K.WRAITH, h.team, x, z, {
          ai: 'summon', owner: h.id, hp, maxHp: hp, armor: WRAITH_STATS.armor, mr: WRAITH_STATS.mr, radius: WRAITH_STATS.radius,
          speed: WRAITH_STATS.speed, stats: { ...WRAITH_STATS, dmg: V(s, h) }, expires: w.t + s.dur,
        });
      }
    },
  },

  // ------------------------------------------------------------ AURELIA
  aurelia: {
    q(w, h, a) {
      const s = a.spec;
      w.spawnProj({
        owner: h, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, width: s.width, vis: 'lance',
        onHit: (w2, p, t) => {
          w2.damage(h, t, V(s, h), 'magic', { ability: true });
          let best = null, bestPct = 2;
          for (const ally of w2.alliesNear(h.team, h.x, h.z, 12)) {
            const pct = ally.hp / ally.maxHp;
            if (pct < bestPct) { bestPct = pct; best = ally; }
          }
          if (best) {
            w2.heal(h, best, abilityValue(s, h, 'heal', 'healLvl', 'x', 'healAp'));
            w2.emit({ e: 'fx', v: 'healBurst', x: r2(best.x), z: r2(best.z), i: best.id });
          }
        },
      });
    },
    e(w, h, a) {
      const s = a.spec;
      const [tx, tz] = groundPoint(h, a, s.range);
      w.emit({ e: 'fx', v: 'sanctuary', x: r2(tx), z: r2(tz), r: s.radius, d: s.dur });
      w.spawnZone({
        x: tx, z: tz, dur: s.dur, every: 0.5,
        onTick: (w2, zn) => {
          for (const ally of w2.alliesNear(h.team, zn.x, zn.z, s.radius)) w2.heal(h, ally, abilityValue(s, h, 'heal', 'healLvl', 'x', 'healAp'));
          for (const t of w2.enemiesNear(h.team, zn.x, zn.z, s.radius)) w2.applyCC(t, 'slow', 0.6, h, s.slow);
        },
      });
    },
    r(w, h, a) {
      const s = a.spec;
      for (const ally of w.alliesNear(h.team, h.x, h.z, s.radius)) {
        w.clearEff(ally, ['stun', 'root', 'slow', 'chill', 'airborne', 'burn']);
        w.addShield(ally, V(s, h), s.dur, h);
        w.emit({ e: 'fx', v: 'dawnshield', x: r2(ally.x), z: r2(ally.z), i: ally.id, d: s.dur });
      }
    },
  },

  // ------------------------------------------------------------ ZEPHYR
  zephyr: {
    q(w, h, a) {
      const s = a.spec;
      if (w.t - h.zStackT > 6) h.zStacks = 0;
      if (h.zStacks >= 2) {
        h.zStacks = 0;
        w.spawnProj({
          owner: h, dx: a.dx, dz: a.dz, speed: 26, range: s.tornadoRange, width: 2.4, pierce: true, vis: 'tornado',
          onHit: (w2, p, t) => {
            w2.damage(h, t, V(s, h), 'phys', { ability: true });
            w2.applyCC(t, 'airborne', s.knock, h);
          },
        });
        return;
      }
      w.emit({ e: 'fx', v: 'thrust', x: r2(h.x), z: r2(h.z), a: r2(Math.atan2(a.dx, a.dz)), l: s.range, i: h.id });
      const hits = w.enemiesInLine(h.team, h.x, h.z, a.dx, a.dz, s.range, s.width);
      for (const t of hits) w.damage(h, t, V(s, h), 'phys', { ability: true });
      if (hits.length) { h.zStacks = Math.min(2, h.zStacks + 1); h.zStackT = w.t; }
    },
    e(w, h, a) {
      const s = a.spec;
      w.startDash(h, h.x + a.dx * s.range, h.z + a.dz * s.range, 0.22, {
        onTick: dashHits(w, h, s, s.width / 2 + 0.2, (t) => w.damage(h, t, V(s, h), 'phys', { ability: true })),
      });
    },
    r(w, h, a) {
      const s = a.spec;
      w.emit({ e: 'fx', v: 'tempest', x: r2(h.x), z: r2(h.z), r: s.radius, i: h.id });
      for (const t of w.enemiesNear(h.team, h.x, h.z, s.radius)) {
        w.damage(h, t, V(s, h), 'phys', { ability: true });
        if (w.isCCImmune(t)) continue;
        const dx = t.x - h.x, dz = t.z - h.z;
        const d = Math.hypot(dx, dz) || 1;
        const pull = Math.max(0, d - (h.radius + t.radius + 0.6));
        if (pull > 0.2) w.startDash(t, t.x - (dx / d) * pull, t.z - (dz / d) * pull, 0.25);
        w.applyCC(t, 'airborne', s.knock + 0.25, h);
      }
    },
  },

  // ------------------------------------------------------------ IGNIS
  ignis: {
    q(w, h, a) {
      const s = a.spec;
      const explode = (w2, x, z) => {
        w2.emit({ e: 'fx', v: 'explosion', x: r2(x), z: r2(z), r: s.radius });
        const burn = s.burn + s.burnLvl * (h.level - 1) + 0.1 * h.stats.ap;
        for (const t of w2.enemiesNear(h.team, x, z, s.radius)) {
          w2.damage(h, t, V(s, h), 'magic', { ability: true });
          if (!t.dead) w2.addEffect(t, 'burn', s.burnDur, burn, h);
        }
      };
      w.spawnProj({
        owner: h, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, width: s.width, vis: 'fireball',
        onHit: (w2, p) => explode(w2, p.x, p.z),
        onEnd: (w2, p) => explode(w2, p.x, p.z),
      });
    },
    e(w, h, a) {
      const s = a.spec;
      const sx = h.x + a.dx * 1.2, sz = h.z + a.dz * 1.2;
      const ex = sx + a.dx * s.range, ez = sz + a.dz * s.range;
      w.emit({ e: 'fx', v: 'flamewall', x: r2(sx), z: r2(sz), a: r2(Math.atan2(a.dx, a.dz)), l: s.range, r: s.width / 2, d: s.dur });
      w.spawnZone({
        x: sx, z: sz, dur: s.dur, every: 0.5,
        onTick: (w2) => {
          for (const t of w2.enemiesNear(h.team, (sx + ex) / 2, (sz + ez) / 2, s.range / 2 + s.width)) {
            if (segDist2(t.x, t.z, sx, sz, ex, ez) > (s.width / 2 + t.radius) ** 2) continue;
            w2.damage(h, t, V(s, h), 'magic', { ability: true });
            w2.applyCC(t, 'slow', 0.6, h, s.slow);
          }
        },
      });
    },
    r(w, h, a) {
      const s = a.spec;
      w.emit({ e: 'fx', v: 'inferno', x: r2(h.x), z: r2(h.z), r: s.radius, i: h.id, d: s.dur });
      h.channel = {
        until: w.t + s.dur, every: s.dur / s.ticks, nextTick: w.t + 0.1, slow: 0.3,
        onTick: (w2, hero) => {
          for (const t of w2.enemiesNear(h.team, hero.x, hero.z, s.radius)) w2.damage(h, t, V(s, h), 'magic', { ability: true });
        },
      };
    },
  },

  // ------------------------------------------------------------ RIME
  rime: {
    q(w, h, a) {
      const s = a.spec;
      w.spawnProj({
        owner: h, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, width: s.width, vis: 'iceShard',
        onHit: (w2, p, t) => {
          w2.damage(h, t, V(s, h), 'magic', { ability: true });
          w2.applyCC(t, 'chill', 2, h, s.slow);
          w2.emit({ e: 'fx', v: 'iceHit', x: r2(t.x), z: r2(t.z), i: t.id });
        },
      });
    },
    e(w, h, a) {
      const s = a.spec;
      w.addShield(h, V(s, h) + s.hpPct * h.maxHp, s.dur, h);
      w.emit({ e: 'fx', v: 'glacial', x: r2(h.x), z: r2(h.z), r: s.radius, i: h.id, d: s.dur });
      w.spawnZone({
        x: h.x, z: h.z, follow: h.id, dur: s.dur, every: 0.5,
        onTick: (w2, zn) => { for (const t of w2.enemiesNear(h.team, zn.x, zn.z, s.radius)) w2.applyCC(t, 'chill', 0.7, h, s.slow); },
      });
    },
    r(w, h, a) {
      const s = a.spec;
      const ch = { until: w.t + s.delay + 0.05, every: 99, nextTick: w.t + 99, slow: 1, lock: true, onTick() {} };
      h.channel = ch;
      h.wind = null;
      w.emit({ e: 'tele', sh: 'circle', x: r2(h.x), z: r2(h.z), r: s.radius, d: s.delay, tm: h.team });
      w.after(s.delay, (w2) => {
        if (h.dead || h.channel !== ch) return;
        w2.emit({ e: 'fx', v: 'frostnova', x: r2(h.x), z: r2(h.z), r: s.radius, i: h.id });
        for (const t of w2.enemiesNear(h.team, h.x, h.z, s.radius)) {
          w2.damage(h, t, V(s, h), 'magic', { ability: true });
          w2.applyCC(t, 'stun', s.stun, h);
          w2.applyCC(t, 'chill', s.stun + 1.5, h, 0.3);
        }
      });
    },
  },
};

export { dist2 };
