// Non-hero AI: lane minions, summoned wraiths, jungle monsters and bosses.
import { DT, K } from '../constants.js';
import { resolveStatic, steer } from '../map.js';
import { dist2 } from '../math.js';

export const MINION_STATS = {
  [K.MELEE]: { hp: 430, hpW: 12, dmg: 13, dmgW: 0.7, armor: 12, mr: 0, range: 2.0, as: 1.0, speed: 6.4, radius: 0.65, gold: 21, xp: 58 },
  [K.CASTER]: { hp: 290, hpW: 8, dmg: 22, dmgW: 1.1, armor: 0, mr: 0, range: 8, as: 0.75, speed: 6.4, radius: 0.55, gold: 15, xp: 30, proj: 'caster', projSpeed: 28 },
  [K.SIEGE]: { hp: 820, hpW: 28, dmg: 38, dmgW: 1.5, armor: 25, mr: 25, range: 9.5, as: 0.55, speed: 6.2, radius: 0.95, gold: 55, xp: 90, proj: 'siege', projSpeed: 24, structMult: 2 },
};

export const MONSTER_STATS = {
  wolf: { kind: K.WOLF, hp: 1150, dmg: 34, armor: 15, mr: 10, range: 2.4, as: 0.9, speed: 7.5, radius: 1.0, gold: 60, xp: 85, leash: 13 },
  wolfSmall: { kind: K.WOLF, hp: 420, dmg: 14, armor: 8, mr: 5, range: 2.0, as: 1.0, speed: 7.5, radius: 0.7, gold: 25, xp: 35, leash: 13 },
  golem: { kind: K.GOLEM, hp: 1900, dmg: 50, armor: 22, mr: 15, range: 3.0, as: 0.6, speed: 5.5, radius: 1.6, gold: 125, xp: 170, leash: 12 },
  raptor: { kind: K.RAPTOR, hp: 1000, dmg: 30, armor: 12, mr: 10, range: 2.4, as: 1.0, speed: 8, radius: 0.9, gold: 55, xp: 75, leash: 13 },
  raptorSmall: { kind: K.RAPTOR, hp: 300, dmg: 11, armor: 5, mr: 5, range: 2.0, as: 1.1, speed: 8, radius: 0.6, gold: 18, xp: 25, leash: 13 },
  drake: { kind: K.DRAKE, hp: 3400, dmg: 70, armor: 30, mr: 30, range: 4.5, as: 0.6, speed: 6, radius: 2.6, gold: 150, xp: 300, leash: 17, boss: true },
  warden: { kind: K.WARDEN, hp: 6200, dmg: 90, armor: 45, mr: 45, range: 5, as: 0.5, speed: 5.5, radius: 3.2, gold: 250, xp: 500, leash: 18, boss: true },
};

export const WRAITH_STATS = { hp: 380, dmg: 0, armor: 15, mr: 15, range: 2.2, as: 1.1, speed: 8.6, radius: 0.6, gold: 0, xp: 0 };

const RETARGET = 0.4;

function moveToward(w, u, tx, tz, stopDist = 0) {
  if (!w.canMove(u)) return;
  let dx = tx - u.x, dz = tz - u.z;
  const d = Math.hypot(dx, dz);
  if (d <= stopDist || d < 0.01) return;
  dx /= d; dz /= d;
  [dx, dz] = steer(u.x, u.z, dx, dz, u.radius, 5);
  const sp = w.moveSpeed(u) * DT;
  const step = Math.min(sp, d - stopDist);
  let nx = u.x + dx * step, nz = u.z + dz * step;
  [nx, nz] = resolveStatic(nx, nz, u.radius, w.structs);
  u.vx = (nx - u.x) / DT; u.vz = (nz - u.z) / DT;
  u.x = nx; u.z = nz;
  u.rot = Math.atan2(dx, dz);
}

function inRange(u, t, extra = 0) {
  const r = u.stats.range + u.radius + t.radius + extra;
  return dist2(u.x, u.z, t.x, t.z) <= r * r;
}

function startAttack(w, u, t) {
  const windup = u.stats.boss ? 0.45 : 0.25;
  u.windup = { at: w.t + windup, target: t.id };
  u.atkReady = w.t + 1 / u.stats.as;
  u.rot = Math.atan2(t.x - u.x, t.z - u.z);
  w.emit({ e: 'atk', i: u.id, x: +t.x.toFixed(1), z: +t.z.toFixed(1), w: windup });
}

function resolveAttack(w, u) {
  const t = w.ents.get(u.windup.target);
  u.windup = null;
  if (!t || t.dead || !w.canHit(t) || !inRange(u, t, 2)) return;
  if (u.stats.proj) {
    w.spawnProj({
      owner: u, x: u.x, z: u.z, dx: 0, dz: 1, speed: u.stats.projSpeed, range: 30, target: t.id, vis: u.stats.proj + (u.team === 0 ? 'B' : 'R'),
      onHit: (w2, p, tg) => w2.damage(u, tg, u.stats.dmg, 'phys'),
    });
  } else {
    w.damage(u, t, u.stats.dmg, u.ai === 'summon' ? 'magic' : 'phys');
  }
}

function laneAcquire(w, u) {
  const aggro = Math.max(9, u.stats.range + 2.5);
  const valid = (e) => e && !e.dead && e.team !== u.team && e.team !== 2 && w.canTarget(e, u.team);
  let best = null, bd = Infinity;
  // 1) call for help — enemy hero attacking an allied hero nearby
  for (const h of w.heroes) {
    if (!valid(h)) continue;
    const hc = w.lastHelpCall.get(h.id);
    if (!hc || w.t - hc.t > 2) continue;
    const victim = w.ents.get(hc.victim);
    if (!victim || victim.team !== u.team) continue;
    const d = dist2(u.x, u.z, h.x, h.z);
    if (d < aggro * aggro && d < bd) { bd = d; best = h; }
  }
  if (best) return best;
  // 2) nearest enemy minion / summon
  for (const e of w.units) {
    if (!valid(e)) continue;
    const d = dist2(u.x, u.z, e.x, e.z);
    if (d < aggro * aggro && d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  // 3) structures
  for (const s of w.structs) {
    if (!valid(s)) continue;
    const d = dist2(u.x, u.z, s.x, s.z);
    const r = aggro + s.radius;
    if (d < r * r && d < bd) { bd = d; best = s; }
  }
  if (best) return best;
  // 4) enemy heroes
  for (const h of w.heroes) {
    if (!valid(h)) continue;
    const d = dist2(u.x, u.z, h.x, h.z);
    if (d < (aggro - 1) ** 2 && d < bd) { bd = d; best = h; }
  }
  return best;
}

function tickLane(w, u) {
  let t = u.target ? w.ents.get(u.target) : null;
  const stillValid = t && !t.dead && w.canTarget(t, u.team) && dist2(u.x, u.z, t.x, t.z) < (Math.max(11, u.stats.range + 4) + t.radius) ** 2;
  if (!stillValid) t = null;
  if (w.t >= u.retargetAt || !t) {
    u.retargetAt = w.t + RETARGET + (u.id % 5) * 0.02;
    const nt = laneAcquire(w, u);
    // stick to current target unless the new one is a call-for-help hero
    if (!t || (nt && nt.kind === K.HERO && t.kind !== K.HERO)) t = nt;
  }
  u.target = t ? t.id : null;
  if (t) {
    if (inRange(u, t)) {
      u.vx = 0; u.vz = 0;
      u.rot = Math.atan2(t.x - u.x, t.z - u.z);
      if (!u.windup && w.t >= u.atkReady) startAttack(w, u, t);
    } else {
      moveToward(w, u, t.x, t.z, u.stats.range + t.radius + u.radius - 0.2);
    }
    return;
  }
  // walk the lane
  const p = u.path;
  if (u.wp < p.length) {
    const [tx, tz] = p[u.wp];
    if (dist2(u.x, u.z, tx, tz) < 6) u.wp++;
    moveToward(w, u, tx, tz);
  } else { u.vx = 0; u.vz = 0; }
}

function tickSummon(w, u) {
  const owner = w.ents.get(u.owner);
  let t = u.target ? w.ents.get(u.target) : null;
  if (!t || t.dead || !w.canTarget(t, u.team) || dist2(u.x, u.z, t.x, t.z) > 18 * 18) t = null;
  if (!t || w.t >= u.retargetAt) {
    u.retargetAt = w.t + 0.5;
    let best = null, bd = Infinity;
    for (const e of [...w.heroes, ...w.units]) {
      if (e.team === u.team || e.dead || !w.canTarget(e, u.team)) continue;
      const d = dist2(u.x, u.z, e.x, e.z) * (e.kind === K.HERO ? 0.4 : 1);
      if (d < 14 * 14 && d < bd) { bd = d; best = e; }
    }
    if (best) t = best;
  }
  u.target = t ? t.id : null;
  if (t) {
    if (inRange(u, t)) { u.vx = u.vz = 0; if (!u.windup && w.t >= u.atkReady) startAttack(w, u, t); }
    else moveToward(w, u, t.x, t.z, u.stats.range + t.radius);
  } else if (owner && !owner.dead) {
    moveToward(w, u, owner.x, owner.z, 3);
  }
}

function tickMonster(w, u) {
  const s = u.stats;
  if (u.resetting) {
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3 * DT);
    const d = Math.hypot(u.home[0] - u.x, u.home[1] - u.z);
    if (d < 0.6) { u.resetting = false; u.hp = u.maxHp; u.dmgLog.clear(); u.rot = Math.atan2(-u.home[0], -u.home[1]); }
    else { const sp = u.speed; u.speed = sp * 1.6; moveToward(w, u, u.home[0], u.home[1]); u.speed = sp; }
    return;
  }
  if (!u.target) {
    u.vx = u.vz = 0;
    if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * DT);
    return;
  }
  const t = w.ents.get(u.target);
  const fromHome = Math.hypot(u.x - u.home[0], u.z - u.home[1]);
  if (!t || t.dead || !w.canHit(t) || fromHome > s.leash || Math.hypot(t.x - u.home[0], t.z - u.home[1]) > s.leash + 5) {
    // try another nearby attacker before resetting
    let alt = null;
    for (const [hid, time] of u.dmgLog) {
      const h = w.ents.get(hid);
      if (h && !h.dead && w.t - time < 4 && Math.hypot(h.x - u.home[0], h.z - u.home[1]) < s.leash) { alt = h; break; }
    }
    if (alt && fromHome <= s.leash) { u.target = alt.id; return; }
    u.target = null;
    u.windup = null;
    u.resetting = true;
    return;
  }
  // boss specials
  if (s.boss && w.t >= u.special && !u.windup && w.canAct(u)) {
    bossSpecial(w, u, t);
    return;
  }
  if (u.casting && w.t < u.casting) return;
  if (inRange(u, t)) {
    u.vx = u.vz = 0;
    u.rot = Math.atan2(t.x - u.x, t.z - u.z);
    if (!u.windup && w.t >= u.atkReady) startAttack(w, u, t);
  } else moveToward(w, u, t.x, t.z, s.range + t.radius + u.radius - 0.3);
}

function bossSpecial(w, u, t) {
  const minute = w.t / 60;
  u.special = w.t + (u.kind === K.WARDEN ? 7 : 6);
  if (u.kind === K.DRAKE) {
    const ang = Math.atan2(t.x - u.x, t.z - u.z);
    u.rot = ang;
    const len = 11, half = 0.62, delay = 1.0;
    u.casting = w.t + delay + 0.3;
    w.emit({ e: 'tele', sh: 'cone', x: +u.x.toFixed(2), z: +u.z.toFixed(2), a: +ang.toFixed(3), l: len, h: half, d: delay, tm: 2 });
    w.emit({ e: 'cast', i: u.id, s: 'q' });
    w.after(delay, () => {
      if (u.dead) return;
      w.emit({ e: 'fx', v: 'breath', x: u.x, z: u.z, a: ang, l: len, i: u.id });
      const dx = Math.sin(ang), dz = Math.cos(ang);
      for (const e of [...w.heroes, ...w.units]) {
        if (e.team === 2 || e.dead || !w.canHit(e)) continue;
        const ox = e.x - u.x, oz = e.z - u.z;
        const d = Math.hypot(ox, oz);
        if (d > len + e.radius) continue;
        const cos = d > 0.01 ? (ox * dx + oz * dz) / d : 1;
        if (Math.acos(Math.max(-1, Math.min(1, cos))) > half) continue;
        w.damage(u, e, 150 + 10 * minute, 'magic', { ability: true });
        w.addEffect(e, 'burn', 3, 20 + minute * 2, u);
      }
    });
  } else {
    const r = 7.5, delay = 1.15;
    u.casting = w.t + delay + 0.4;
    w.emit({ e: 'tele', sh: 'circle', x: +u.x.toFixed(2), z: +u.z.toFixed(2), r, d: delay, tm: 2 });
    w.emit({ e: 'cast', i: u.id, s: 'q' });
    w.after(delay, () => {
      if (u.dead) return;
      w.emit({ e: 'fx', v: 'slam', x: u.x, z: u.z, r, i: u.id });
      for (const e of [...w.heroes, ...w.units]) {
        if (e.team === 2 || e.dead || !w.canHit(e)) continue;
        if (dist2(e.x, e.z, u.x, u.z) > (r + e.radius) ** 2) continue;
        w.damage(u, e, 190 + 12 * minute, 'phys', { ability: true });
        w.applyCC(e, 'airborne', 0.75, u);
      }
    });
  }
}

export function tickUnit(w, u) {
  if (u.expires && w.t >= u.expires) return;
  if (u.dash) { w.tickDash(u); return; }
  if (!w.canAct(u)) { u.vx = u.vz = 0; return; }
  if (u.windup && w.t >= u.windup.at) resolveAttack(w, u);
  if (u.windup) return;
  if (u.ai === 'lane') tickLane(w, u);
  else if (u.ai === 'summon') tickSummon(w, u);
  else if (u.ai === 'monster') tickMonster(w, u);
}

// Soft separation so minion blobs don't stack into one point.
export function separateUnits(w) {
  const list = w.units;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead || a.ai === 'monster') continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead || b.ai === 'monster') continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const min = (a.radius + b.radius) * 0.9;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.35;
      const nx = dx / d, nz = dz / d;
      if (!a.dash && w.canMove(a)) { a.x -= nx * push; a.z -= nz * push; }
      if (!b.dash && w.canMove(b)) { b.x += nx * push; b.z += nz * push; }
    }
  }
}
