// Bot brains. Bots produce the exact same input a human produces (move vector, aim point,
// attack, ability presses), so they obey every rule a player does.
import { K, ULT_LEVEL } from '../constants.js';
import { FOUNTAIN_POS, lanePath, laneProgress, lanePoint, steer, BOSSES, CAMPS } from '../map.js';
import { dist2, clamp, rng } from '../math.js';
import { ITEM_BY_ID } from '../items.js';

const DIFF = {
  easy: { think: 0.32, aimErr: 0.32, ability: 0.35, dodge: 0.0, retreat: 0.22, aggression: 0.75, lead: 0.3, lastHit: 0.4 },
  normal: { think: 0.2, aimErr: 0.13, ability: 0.75, dodge: 0.3, retreat: 0.32, aggression: 1.0, lead: 0.75, lastHit: 0.8 },
  hard: { think: 0.1, aimErr: 0.05, ability: 1.0, dodge: 0.65, retreat: 0.36, aggression: 1.15, lead: 1.0, lastHit: 1.0 },
};

const TOWER_RANGE = 14.2;

function brainOf(w, h) {
  if (!h.brain) {
    h.brain = {
      next: 0, target: 0, strafe: 1, strafeT: 0, stuckT: 0, lastX: h.x, lastZ: h.z, unstickUntil: 0, unstickDir: [0, 0],
      mode: 'lane', lastHp: h.hp, rnd: rng(Math.imul(h.id + 1, 2654435761) ^ Math.floor(w.rand() * 4294967296)),
    };
  }
  return h.brain;
}

function rand(b) {
  return b.rnd();
}

function enemyTowers(w, team) {
  return w.structs.filter((s) => s.team !== team && !s.dead && s.kind === K.TOWER);
}

function underEnemyTower(w, team, x, z, margin = 0) {
  for (const s of w.structs) {
    if (s.team === team || s.dead || s.kind !== K.TOWER) continue;
    if (dist2(x, z, s.x, s.z) < (TOWER_RANGE + margin) ** 2) return s;
  }
  return null;
}

function moveTo(h, inp, tx, tz, stop = 0) {
  let dx = tx - h.x, dz = tz - h.z;
  const d = Math.hypot(dx, dz);
  if (d <= stop || d < 0.05) { inp.mx = 0; inp.mz = 0; return d; }
  dx /= d; dz /= d;
  [dx, dz] = steer(h.x, h.z, dx, dz, h.radius, 6);
  inp.mx = dx; inp.mz = dz;
  return d;
}

function predict(w, h, t, speed, lead) {
  const d = Math.hypot(t.x - h.x, t.z - h.z);
  const time = speed > 0 ? (d / speed) * lead : 0;
  return [t.x + (t.vx || 0) * time, t.z + (t.vz || 0) * time];
}

function setAim(h, inp, x, z, err, b) {
  const dx = x - h.x, dz = z - h.z;
  const d = Math.hypot(dx, dz);
  if (err > 0 && d > 0.5) {
    const a = Math.atan2(dx, dz) + (rand(b) - 0.5) * 2 * err;
    inp.ax = h.x + Math.sin(a) * d;
    inp.az = h.z + Math.cos(a) * d;
  } else {
    inp.ax = x; inp.az = z;
  }
}

function ready(w, h, slot) {
  if (slot === 'r' && h.level < ULT_LEVEL) return false;
  return w.t >= h.cds[slot];
}

function bestFrontS(w, h, path) {
  // furthest allied minion along our lane
  let best = -1;
  for (const u of w.units) {
    if (u.team !== h.team || u.dead || u.ai !== 'lane' || u.lane !== h.lane) continue;
    const { s } = laneProgress(path, u.x, u.z);
    if (s > best) best = s;
  }
  return best;
}

function safeLaneS(w, h, path) {
  // stand just behind our furthest living tower in this lane
  let s = 18;
  for (const t of w.structs) {
    if (t.team !== h.team || t.dead || t.kind !== K.TOWER) continue;
    if (t.lane !== h.lane && t.lane !== 'base') continue;
    const p = laneProgress(path, t.x, t.z);
    if (p.d < 8 && p.s > s) s = p.s;
  }
  return s - 3;
}

function planObjectives(w, team) {
  const plan = w.plans[team];
  if (plan && w.t < plan.until) {
    const camp = w.camps[plan.camp];
    if (camp && camp.alive.length) return plan;
    w.plans[team] = null;
    return null;
  }
  if (w.tick % 90 !== 0) return plan && w.t < plan.until ? plan : null;
  const mine = w.heroes.filter((x) => x.team === team && !x.dead);
  const theirs = w.heroes.filter((x) => x.team !== team && !x.dead);
  if (mine.length < 3 || mine.length < theirs.length) return null;
  for (const camp of w.camps) {
    if (!camp.boss || !camp.alive.length) continue;
    if (camp.type === 'warden' && w.t < 600) continue;
    w.plans[team] = { camp: camp.i, until: w.t + 40, pos: camp.pos };
    return w.plans[team];
  }
  return null;
}

export function botThink(w, h) {
  const b = brainOf(w, h);
  const P = DIFF[h.difficulty] || DIFF.normal;
  const inp = h.input;
  inp.casts.length = 0;

  if (h.dead) {
    shop(w, h);
    inp.mx = inp.mz = 0; inp.atk = false;
    return;
  }
  if (w.inShop(h)) shop(w, h);

  // keep tracking the current target's position between decisions
  if (w.t < b.next) {
    const t = b.target ? w.ents.get(b.target) : null;
    if (t && !t.dead) {
      const sp = h.def.atk ? h.def.atk.speed : 0;
      const [px, pz] = predict(w, h, t, sp, P.lead);
      setAim(h, inp, px, pz, 0, b);
    }
    return;
  }
  b.next = w.t + P.think * (0.8 + rand(b) * 0.4);

  inp.atk = false;
  const hpPct = h.hp / h.maxHp;
  const path = lanePath(w.t > 840 ? 'mid' : h.lane, h.team);
  const [fx, fz] = FOUNTAIN_POS[h.team];
  const myRange = h.stats.range;

  // stuck detection
  const moved = Math.hypot(h.x - b.lastX, h.z - b.lastZ);
  if ((Math.abs(inp.mx) + Math.abs(inp.mz)) > 0.3 && moved < 0.15 && !h.wind) b.stuckT += P.think; else b.stuckT = 0;
  b.lastX = h.x; b.lastZ = h.z;
  if (b.stuckT > 1.0) {
    const a = rand(b) * Math.PI * 2;
    b.unstickDir = [Math.sin(a), Math.cos(a)];
    b.unstickUntil = w.t + 0.7;
    b.stuckT = 0;
  }
  if (w.t < b.unstickUntil) { inp.mx = b.unstickDir[0]; inp.mz = b.unstickDir[1]; return; }

  // dodge telegraphs + incoming skillshots
  if (P.dodge > 0 && evade(w, h, inp, b, P)) return;

  const enemiesHeroes = w.heroes.filter((e) => e.team !== h.team && !e.dead && w.canTarget(e, h.team) && dist2(h.x, h.z, e.x, e.z) < 18 * 18);
  const allies = w.heroes.filter((e) => e.team === h.team && !e.dead && e !== h && dist2(h.x, h.z, e.x, e.z) < 18 * 18);
  const tower = underEnemyTower(w, h.team, h.x, h.z, 1.5);
  const towerOnMe = tower && tower.target === h.id;
  const tookDamage = h.hp < b.lastHp - h.maxHp * 0.08;
  b.lastHp = h.hp;

  // recalling: stay put unless threatened
  if (h.recall) {
    if (enemiesHeroes.some((e) => dist2(h.x, h.z, e.x, e.z) < 11 * 11)) { moveTo(h, inp, fx, fz); }
    else { inp.mx = inp.mz = 0; return; }
  }

  // heal up at fountain
  const atBase = dist2(h.x, h.z, fx, fz) < 12 * 12;
  if (atBase && hpPct < 0.92) { inp.mx = inp.mz = 0; return; }

  // ---- retreat logic
  const myPower = (hpPct + 0.2) * h.level + allies.reduce((s, a) => s + (a.hp / a.maxHp + 0.2) * a.level, 0);
  const theirPower = enemiesHeroes.reduce((s, e) => s + (e.hp / e.maxHp + 0.2) * e.level, 0);
  const outnumbered = theirPower > myPower * 1.35 * P.aggression;
  if (towerOnMe || (hpPct < P.retreat && enemiesHeroes.length) || (outnumbered && hpPct < 0.75)) {
    retreat(w, h, inp, path, fx, fz);
    // panic buttons
    const nearest = enemiesHeroes.sort((a, c) => dist2(h.x, h.z, a.x, a.z) - dist2(h.x, h.z, c.x, c.z))[0];
    if (nearest && dist2(h.x, h.z, nearest.x, nearest.z) < 7 * 7) {
      if (w.t >= h.cds.d && rand(b) < P.dodge + 0.2) inp.casts.push('d');
      escapeAbilities(w, h, inp, nearest);
      inp.ax = nearest.x; inp.az = nearest.z;
      if (dist2(h.x, h.z, nearest.x, nearest.z) < (myRange + 1) ** 2) inp.atk = true;
    }
    return;
  }
  const nextItem = w.nextBuildItem(h);
  const wantsBase = (hpPct < 0.35 && !enemiesHeroes.length) || (nextItem && !enemiesHeroes.length && h.gold >= ITEM_BY_ID[nextItem].cost + 250 && hpPct < 0.85);
  if (wantsBase && !atBase) {
    const unitsNear = w.units.some((u) => u.team !== h.team && !u.dead && dist2(h.x, h.z, u.x, u.z) < 12 * 12);
    if (!unitsNear && w.t - h.lastDamaged > 2.5) { inp.mx = inp.mz = 0; if (!h.recall) inp.casts.push('b'); return; }
    if (hpPct < 0.35) { retreat(w, h, inp, path, fx, fz); return; }
  }

  // ---- fight
  let target = null, tScore = Infinity;
  const engageR = (h.def.ranged ? myRange + 4 : 11) * P.aggression;
  for (const e of enemiesHeroes) {
    const d = Math.hypot(e.x - h.x, e.z - h.z);
    if (d > engageR + 4) continue;
    const eTower = underEnemyTower(w, h.team, e.x, e.z, 0);
    const killable = e.hp / e.maxHp < 0.3 && hpPct > 0.5;
    if (eTower && !killable && w.t > 0) continue;
    const s = (e.hp / e.maxHp) * 1.5 + d / 12;
    if (s < tScore) { tScore = s; target = e; }
  }
  const plan = planObjectives(w, h.team);
  if (target && (!outnumbered || target.hp / target.maxHp < 0.25)) {
    fight(w, h, inp, b, P, target, enemiesHeroes, allies);
    return;
  }

  // ---- objectives (team plan)
  if (plan && hpPct > 0.5) {
    const camp = w.camps[plan.camp];
    const boss = camp && camp.alive.find((u) => !u.dead);
    if (boss) {
      const d = Math.hypot(boss.x - h.x, boss.z - h.z);
      if (d > 30) { moveTo(h, inp, boss.x, boss.z, 0); return; }
      const allyCount = w.heroes.filter((x) => x.team === h.team && !x.dead && dist2(x.x, x.z, boss.x, boss.z) < 22 * 22).length;
      if (allyCount < 2 && d > 14) { moveTo(h, inp, boss.x, boss.z, 12); inp.ax = boss.x; inp.az = boss.z; return; }
      attackUnit(w, h, inp, b, P, boss, true);
      return;
    }
  }

  // ---- farm & push
  farm(w, h, inp, b, P, path);
}

function retreat(w, h, inp, path, fx, fz) {
  const { s, d } = laneProgress(path, h.x, h.z);
  if (d > 14) { moveTo(h, inp, fx, fz); return; }
  const [tx, tz] = lanePoint(path, Math.max(0, s - 12));
  moveTo(h, inp, tx, tz);
}

function escapeAbilities(w, h, inp, threat) {
  const away = [h.x - threat.x, h.z - threat.z];
  const l = Math.hypot(...away) || 1;
  const ax = h.x + (away[0] / l) * 10, az = h.z + (away[1] / l) * 10;
  if (h.heroId === 'lyra' && ready(w, h, 'e')) { inp.ax = ax; inp.az = az; inp.casts.push('e'); }
  else if (h.heroId === 'sylva' && ready(w, h, 'e')) { inp.ax = threat.x; inp.az = threat.z; inp.casts.push('e'); }
  else if (h.heroId === 'zephyr' && ready(w, h, 'e')) { inp.ax = ax; inp.az = az; inp.casts.push('e'); }
  else if ((h.heroId === 'kaelen' || h.heroId === 'rime') && ready(w, h, 'e')) inp.casts.push('e');
  else if (h.heroId === 'vex' && ready(w, h, 'e')) inp.casts.push('e');
  else if (h.heroId === 'brakka' && ready(w, h, 'r') && h.hp / h.maxHp < 0.4) inp.casts.push('r');
  else if (h.heroId === 'mordrin' && ready(w, h, 'q')) { inp.ax = threat.x; inp.az = threat.z; inp.casts.push('q'); }
  else if (h.heroId === 'aurelia' && ready(w, h, 'r')) inp.casts.push('r');
}

function fight(w, h, inp, b, P, t, enemies, allies) {
  b.target = t.id;
  const d = Math.hypot(t.x - h.x, t.z - h.z);
  const myRange = h.stats.range;
  const projSpeed = h.def.atk ? h.def.atk.speed : 0;
  const [px, pz] = predict(w, h, t, projSpeed, P.lead);
  setAim(h, inp, px, pz, P.aimErr * 0.5, b);

  // movement: melee chase, ranged kite with strafing
  if (h.def.ranged) {
    if (w.t > b.strafeT) { b.strafe = rand(b) < 0.5 ? -1 : 1; b.strafeT = w.t + 0.5 + rand(b) * 0.8; }
    const dx = (t.x - h.x) / (d || 1), dz = (t.z - h.z) / (d || 1);
    const desired = myRange * 0.85;
    let fwd = d > desired + 1 ? 1 : d < desired - 2 ? -1 : 0;
    const mx = dx * fwd + -dz * b.strafe * 0.7, mz = dz * fwd + dx * b.strafe * 0.7;
    const l = Math.hypot(mx, mz) || 1;
    const [sx, sz] = steer(h.x, h.z, mx / l, mz / l, h.radius, 4);
    inp.mx = sx; inp.mz = sz;
  } else {
    moveTo(h, inp, t.x, t.z, myRange * 0.6 + t.radius);
  }
  inp.atk = d <= myRange + t.radius + 1.0;

  if (rand(b) > P.ability) return;
  const hpT = t.hp / t.maxHp;
  const hpMe = h.hp / h.maxHp;
  const def = h.def;
  const aimAt = (slot) => {
    const spec = def[slot];
    const sp = spec.speed || 0;
    const [qx, qz] = predict(w, h, t, sp, P.lead);
    setAim(h, inp, qx, qz, P.aimErr, b);
  };
  const enemiesNear = (r) => enemies.filter((e) => dist2(h.x, h.z, e.x, e.z) < r * r).length;
  const use = (slot) => { aimAt(slot); inp.casts.push(slot); };

  // ultimate first if worthwhile
  if (ready(w, h, 'r')) {
    const r = def.r;
    let go = false;
    switch (h.heroId) {
      case 'kaelen': go = d < r.range && (hpT < 0.6 || enemiesNear(r.radius + 3) >= 2); break;
      case 'lyra': go = d < r.range && (hpT < 0.55 || enemiesNear(r.range) >= 2); break;
      case 'vex': go = d < r.range && hpT < 0.55; break;
      case 'brakka': go = d < 6 && (hpMe < 0.65 || enemiesNear(8) >= 2); break;
      case 'sylva': go = d < 30 && hpT < 0.5; break;
      case 'mordrin': go = d < 12; break;
      case 'aurelia': go = allies.some((a) => a.hp / a.maxHp < 0.35) || hpMe < 0.35; break;
      case 'zephyr': go = d < r.radius - 0.5 && (hpT < 0.6 || enemiesNear(r.radius) >= 2); break;
      case 'ignis': go = d < r.radius - 1.5; break;
      case 'rime': go = d < r.radius - 1.2; break;
    }
    if (go) { use('r'); return; }
  }
  for (const slot of ['q', 'e']) {
    if (!ready(w, h, slot)) continue;
    const s = def[slot];
    let go = false;
    switch (s.aim) {
      case 'dir': go = d <= (s.range || 6) * 0.92 + t.radius; break;
      case 'point': go = d <= (s.range || 8) + (s.radius || 0) * 0.5; break;
      case 'self': go = s.radius ? d <= s.radius * 0.85 : d <= 8; break;
      case 'unit': go = d <= s.range; break;
    }
    // special cases
    if (h.heroId === 'sylva' && slot === 'e') go = d < 7;
    if (h.heroId === 'lyra' && slot === 'e') go = hpMe < 0.4 && d < 6;
    if (h.heroId === 'vex' && slot === 'e') go = d > 6 && d < 14;
    if (h.heroId === 'aurelia' && slot === 'e') go = d < s.range || allies.some((a) => a.hp / a.maxHp < 0.6);
    if ((h.heroId === 'kaelen' || h.heroId === 'rime') && slot === 'e') go = d < s.radius || h.hp < b.lastHp;
    if (go) {
      if (h.heroId === 'aurelia' && slot === 'e') {
        const hurt = allies.find((a) => a.hp / a.maxHp < 0.6);
        if (hurt) { inp.ax = hurt.x; inp.az = hurt.z; inp.casts.push('e'); return; }
      }
      use(slot);
      return;
    }
  }
}

function attackUnit(w, h, inp, b, P, u, isObjective = false) {
  b.target = u.id;
  const d = Math.hypot(u.x - h.x, u.z - h.z);
  const reach = h.stats.range + u.radius + 0.5;
  if (d > reach - 0.3) moveTo(h, inp, u.x, u.z, reach - 0.8);
  else { inp.mx = inp.mz = 0; }
  inp.ax = u.x; inp.az = u.z;
  inp.atk = d <= reach + 0.6;
  if (isObjective && rand(b) < P.ability) {
    for (const slot of ['q', 'e']) {
      const s = h.def[slot];
      if (!ready(w, h, slot)) continue;
      if (s.aim === 'dir' && d < (s.range || 5) && h.heroId !== 'sylva') { inp.casts.push(slot); break; }
      if (s.aim === 'point' && d < s.range) { inp.casts.push(slot); break; }
      if (s.aim === 'self' && s.radius && d < s.radius) { inp.casts.push(slot); break; }
    }
  }
}

function farm(w, h, inp, b, P, path) {
  const ad = h.stats.ad;
  let lastHit = null, lowest = null, lowHp = Infinity;
  const scan = 15;
  let minionCount = 0;
  for (const u of w.units) {
    if (u.team === h.team || u.team === 2 || u.dead || !w.canTarget(u, h.team)) continue;
    const d2 = dist2(h.x, h.z, u.x, u.z);
    if (d2 > scan * scan) continue;
    if (underEnemyTower(w, h.team, u.x, u.z, -1) && !alliedMinionsTanking(w, h)) continue;
    minionCount++;
    const eff = ad * (100 / (100 + (u.armor || 0)));
    if (u.hp <= eff * 1.05 && rand(b) < P.lastHit + 0.2) { if (!lastHit || u.hp < lastHit.hp) lastHit = u; }
    if (u.hp < lowHp) { lowHp = u.hp; lowest = u; }
  }
  // AoE wave clear sometimes
  if (minionCount >= 3 && rand(b) < 0.08 * P.ability) {
    for (const slot of ['q', 'e']) {
      const s = h.def[slot];
      if (!ready(w, h, slot) || s.aim === 'unit') continue;
      if (['vex', 'kaelen', 'zephyr', 'sylva', 'lyra', 'aurelia', 'rime', 'mordrin'].includes(h.heroId) && slot === 'e') continue;
      if (lowest) { inp.ax = lowest.x; inp.az = lowest.z; inp.casts.push(slot); }
      break;
    }
  }
  const target = lastHit || lowest;
  if (target) { attackUnit(w, h, inp, b, P, target); return; }

  // push structures when our minions are there
  for (const s of w.structs) {
    if (s.team === h.team || s.dead || w.structProtected(s)) continue;
    const d = Math.hypot(s.x - h.x, s.z - h.z);
    if (d > 20) continue;
    if (!alliedMinionsNear(w, h.team, s.x, s.z, TOWER_RANGE) && s.kind === K.TOWER) continue;
    attackUnit(w, h, inp, b, P, s);
    return;
  }

  // walk to the lane front
  b.target = 0;
  const { s, d } = laneProgress(path, h.x, h.z);
  let front = bestFrontS(w, h, path);
  const safe = safeLaneS(w, h, path);
  let goal = front > 0 ? front - (h.def.ranged ? 6 : 3) : safe;
  goal = Math.max(goal, 8);
  if (d > 10) {
    const [tx, tz] = lanePoint(path, Math.max(goal - 10, Math.min(s, goal)));
    moveTo(h, inp, tx, tz, 1);
  } else {
    const ahead = clamp(goal, s - 8, s + 8);
    const [tx, tz] = lanePoint(path, ahead);
    moveTo(h, inp, tx, tz, 1.2);
  }
  const [lx, lz] = lanePoint(path, s + 10);
  inp.ax = lx; inp.az = lz;
}

function alliedMinionsNear(w, team, x, z, r) {
  let n = 0;
  for (const u of w.units) if (u.team === team && !u.dead && u.ai === 'lane' && dist2(u.x, u.z, x, z) < r * r) n++;
  return n >= 2;
}
function alliedMinionsTanking(w, h) {
  const t = underEnemyTower(w, h.team, h.x, h.z, 6);
  if (!t) return true;
  const tg = t.target ? w.ents.get(t.target) : null;
  return alliedMinionsNear(w, h.team, t.x, t.z, TOWER_RANGE) && tg && tg.kind !== K.HERO;
}

function evade(w, h, inp, b, P) {
  // ground telegraphs
  for (const tl of w.teles) {
    if (tl.tm === h.team) continue;
    if (tl.sh === 'circle') {
      const d = Math.hypot(h.x - tl.x, h.z - tl.z);
      if (d < tl.r + 1 && rand(b) < P.dodge + 0.25) {
        const nx = (h.x - tl.x) / (d || 1), nz = (h.z - tl.z) / (d || 1);
        inp.mx = nx || 1; inp.mz = nz;
        if (tl.r - d > 2 && w.t >= h.cds.d && rand(b) < P.dodge) inp.casts.push('d');
        return true;
      }
    } else if (tl.sh === 'cone') {
      const d = Math.hypot(h.x - tl.x, h.z - tl.z);
      if (d < tl.l + 1) {
        const ang = Math.atan2(h.x - tl.x, h.z - tl.z);
        let diff = ang - tl.a;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < tl.h + 0.2 && rand(b) < P.dodge + 0.25) {
          const side = diff > 0 ? 1 : -1;
          const pa = tl.a + side * Math.PI / 2;
          inp.mx = Math.sin(pa); inp.mz = Math.cos(pa);
          return true;
        }
      }
    }
  }
  // incoming skillshots
  for (const p of w.projs) {
    if (p.team === h.team || p.homing || p.dead) continue;
    const owner = w.ents.get(p.owner);
    if (!owner || owner.kind !== K.HERO) continue;
    const ox = h.x - p.x, oz = h.z - p.z;
    const along = ox * p.dx + oz * p.dz;
    if (along < 0 || along > 9) continue;
    const perp = ox * p.dz - oz * p.dx;
    if (Math.abs(perp) > p.radius + h.radius + 0.4) continue;
    if (rand(b) > P.dodge) continue;
    const side = perp >= 0 ? 1 : -1;
    inp.mx = p.dz * side; inp.mz = -p.dx * side;
    if (along < 4 && w.t >= h.cds.d && rand(b) < P.dodge * 0.6) inp.casts.push('d');
    b.next = w.t + 0.25;
    return true;
  }
  return false;
}

function shop(w, h) {
  for (let i = 0; i < 3; i++) {
    const next = w.nextBuildItem(h);
    if (!next) return;
    if (!w.buy(h, next)) return;
  }
}

export { CAMPS, BOSSES, enemyTowers };
