// Authoritative game simulation. Runs on the server for online rooms and in the
// browser for offline play. Pure JS, no DOM, deterministic given inputs + seed.
import {
  DT, BLUE, RED, K, F, MAX_LEVEL, ULT_LEVEL, XP_TABLE, RESPAWN_BASE, RESPAWN_PER_LEVEL,
  PASSIVE_GOLD, START_GOLD, FIRST_WAVE, WAVE_INTERVAL, SURGE_TIME, XP_RANGE, RECALL_TIME,
  DODGE_CD, DODGE_DIST, DODGE_TIME, HERO_RADIUS,
} from '../constants.js';
import {
  SPIRE_POS, FOUNTAIN_POS, FOUNTAIN_RADIUS, SHOP_RADIUS, TOWERS, CAMPS, BOSSES, LANE_NAMES,
  resolveStatic, lanePath,
} from '../map.js';
import { HERO_BY_ID } from '../heroes.js';
import { ITEM_BY_ID, MAX_ITEMS, SELL_RATIO } from '../items.js';
import { rng, dist2, segDist2, clamp } from '../math.js';
import { ABILITIES } from './abilities.js';
import { tickUnit, separateUnits, MINION_STATS, MONSTER_STATS } from './units.js';
import { botThink } from './bots.js';

export const emptyInput = () => ({ mx: 0, mz: 0, ax: 0, az: 0, atk: false, casts: [], seq: 0 });

export class World {
  constructor({ slots, difficulty = 'normal', seed = 7 }) {
    this.t = 0;
    this.tick = 0;
    this.nextId = 1;
    this.ents = new Map();
    this.heroes = [];
    this.units = [];
    this.structs = [];
    this.projs = [];
    this.zones = [];
    this.timers = [];
    this.events = [];
    this.kills = [0, 0];
    this.over = false;
    this.winner = -1;
    this.rand = rng(seed);
    this.difficulty = difficulty;
    this.drakeStacks = [0, 0];
    this.wardenBuff = [0, 0];
    this.firstBlood = false;
    this.nextWave = FIRST_WAVE;
    this.waveCount = 0;
    this.surgeAnnounced = false;
    this.spawnQueue = [];
    this.camps = [];
    this.lastHelpCall = new Map();
    this.teles = [];
    this.plans = [null, null];

    for (const t of TOWERS) this.addStruct(K.TOWER, t.team, t.pos[0], t.pos[1], t);
    for (const team of [BLUE, RED]) this.addStruct(K.SPIRE, team, SPIRE_POS[team][0], SPIRE_POS[team][1], { lane: 'base', tier: 4 });

    CAMPS.forEach((c, i) => this.camps.push({ i, type: c.type, pos: c.pos, alive: [], respawnAt: 90, boss: false }));
    BOSSES.forEach((b, i) => this.camps.push({ i: CAMPS.length + i, type: b.type, pos: b.pos, alive: [], respawnAt: b.type === 'drake' ? 150 : 330, boss: true }));

    // lane assignment for bots
    const laneOrder = { 1: ['mid'], 2: ['top', 'bot'], 3: ['top', 'mid', 'bot'], 4: ['top', 'mid', 'bot', 'bot'], 5: ['top', 'mid', 'bot', 'bot', 'top'] };
    const perTeam = [0, 0];
    const counts = [slots.filter((s) => s.team === BLUE).length, slots.filter((s) => s.team === RED).length];
    for (const slot of slots) {
      const order = laneOrder[Math.max(1, Math.min(5, counts[slot.team]))];
      const lane = slot.lane || order[perTeam[slot.team]++ % order.length];
      this.addHero(slot, lane);
    }
  }

  // ---------------------------------------------------------------- entities
  id() { return this.nextId++; }

  addStruct(kind, team, x, z, info) {
    const tier = info.tier;
    const maxHp = kind === K.SPIRE ? 5200 : tier === 1 ? 3000 : tier === 2 ? 3400 : 3800;
    const s = {
      id: this.id(), kind, team, x, z, rot: 0, radius: kind === K.SPIRE ? 3.6 : 1.9, solid: true,
      hp: maxHp, maxHp, armor: 55, mr: 55, lane: info.lane, tier, dead: false, effects: [], shields: [],
      atkReady: 0, target: null, streakTarget: null, streak: 0, dmgLog: new Map(), lastDamaged: -99,
    };
    this.structs.push(s);
    this.ents.set(s.id, s);
    return s;
  }

  addHero(slot, lane) {
    const def = HERO_BY_ID[slot.heroId];
    const [fx, fz] = FOUNTAIN_POS[slot.team];
    const idx = this.heroes.filter((h) => h.team === slot.team).length;
    const ang = (idx / 5) * Math.PI * 2;
    const h = {
      id: this.id(), kind: K.HERO, team: slot.team, def, heroId: def.id, name: slot.name || def.name,
      playerId: slot.playerId ?? null, bot: !!slot.bot, difficulty: slot.difficulty || this.difficulty, lane,
      x: fx + Math.cos(ang) * 3, z: fz + Math.sin(ang) * 3, rot: slot.team === BLUE ? Math.PI * 0.75 : -Math.PI * 0.25,
      vx: 0, vz: 0, radius: HERO_RADIUS, level: 1, xp: 0, gold: START_GOLD, totalGold: START_GOLD, items: [],
      hp: 1, maxHp: 1, stats: null, effects: [], shields: [], cds: { q: 0, e: 0, r: 0, d: 0 }, atkReady: 0,
      wind: null, dash: null, recall: null, channel: null, queued: null, dead: false, respawnAt: 0,
      k: 0, d: 0, a: 0, cs: 0, dmgLog: new Map(), lastDamaged: -99, lastAttackedHero: -99, input: emptyInput(), seq: 0,
      streak: 0, deathStreak: 0, multi: 0, lastKillT: -99, casts: 0, zStacks: 0, zStackT: 0, veilEmpower: false,
      dmgDealt: 0, brain: null,
    };
    this.recalc(h);
    h.hp = h.maxHp;
    this.heroes.push(h);
    this.ents.set(h.id, h);
    return h;
  }

  addUnit(kind, team, x, z, extra) {
    const u = {
      id: this.id(), kind, team, x, z, rot: 0, vx: 0, vz: 0, dead: false, effects: [], shields: [],
      atkReady: 0, windup: null, target: null, retargetAt: 0, dmgLog: new Map(), lastDamaged: -99, variant: 0,
      ...extra,
    };
    this.units.push(u);
    this.ents.set(u.id, u);
    return u;
  }

  remove(e) {
    this.ents.delete(e.id);
  }

  // ---------------------------------------------------------------- stats
  recalc(h) {
    const s = h.def.stats, L = h.level - 1;
    const st = {
      maxHp: s.hp + s.hpG * L, armor: s.armor + s.armorG * L, mr: s.mr + s.mrG * L, ad: s.ad + s.adG * L, ap: 0,
      as: s.as * (1 + s.asG * L), asBonus: 0, range: s.range, speed: s.speed, speedPct: 0, regen: s.regen * (1 + 0.1 * L),
      lifesteal: 0, cdr: 0, armorPen: 0, magicPen: 0, healPower: 0,
    };
    for (const id of h.items) {
      const it = ITEM_BY_ID[id];
      if (!it) continue;
      const is = it.stats;
      st.maxHp += is.hp || 0; st.ad += is.ad || 0; st.ap += is.ap || 0; st.armor += is.armor || 0; st.mr += is.mr || 0;
      st.asBonus += is.as || 0; st.speedPct += is.speedPct || 0; st.lifesteal += is.lifesteal || 0; st.cdr += is.cdr || 0;
      st.armorPen += is.armorPen || 0; st.magicPen += is.magicPen || 0; st.healPower += is.healPower || 0;
    }
    if (this.wardenBuff[h.team] > this.t) { st.ad += 20; st.ap += 30; }
    st.cdr = Math.min(0.4, st.cdr);
    st.armorPen = Math.min(0.5, st.armorPen);
    st.magicPen = Math.min(0.5, st.magicPen);
    const oldMax = h.maxHp;
    h.stats = st;
    h.maxHp = Math.round(st.maxHp);
    if (oldMax > 1 && h.maxHp > oldMax && !h.dead) h.hp += h.maxHp - oldMax;
    h.hp = Math.min(h.hp, h.maxHp);
  }

  attackSpeed(h) {
    return Math.min(2.5, h.stats.as * (1 + h.stats.asBonus + this.sumEff(h, 'as')));
  }

  moveSpeed(e) {
    const base = e.kind === K.HERO ? e.stats.speed * (1 + e.stats.speedPct) : e.speed;
    const haste = this.maxEff(e, 'haste');
    const slow = Math.max(this.maxEff(e, 'slow'), this.maxEff(e, 'chill'));
    return Math.max(2, base * (1 + haste) * (1 - slow));
  }

  // ---------------------------------------------------------------- effects
  addEffect(e, type, dur, value = 0, src = null) {
    e.effects.push({ type, until: this.t + dur, value, src: src ? src.id : 0 });
  }
  hasEff(e, type) {
    for (const f of e.effects) if (f.type === type && f.until > this.t) return true;
    return false;
  }
  maxEff(e, type) {
    let v = 0;
    for (const f of e.effects) if (f.type === type && f.until > this.t && f.value > v) v = f.value;
    return v;
  }
  sumEff(e, type) {
    let v = 0;
    for (const f of e.effects) if (f.type === type && f.until > this.t) v += f.value;
    return v;
  }
  clearEff(e, types) {
    e.effects = e.effects.filter((f) => !types.includes(f.type));
  }
  isCCImmune(e) {
    return e.kind === K.DRAKE || e.kind === K.WARDEN || e.kind === K.TOWER || e.kind === K.SPIRE || this.hasEff(e, 'unstoppable');
  }
  applyCC(e, type, dur, src, value = 0) {
    if (e.dead) return;
    if (type === 'slow' || type === 'chill') {
      if (e.kind === K.TOWER || e.kind === K.SPIRE || e.kind === K.WARDEN || e.kind === K.DRAKE) return;
      if (this.hasEff(e, 'unstoppable')) return;
      this.addEffect(e, type, dur, value, src);
      return;
    }
    if (this.isCCImmune(e)) return;
    this.addEffect(e, type, dur, value, src);
    if (type === 'stun' || type === 'airborne') this.interrupt(e);
    if (type === 'root' && e.recall) this.cancelRecall(e);
  }
  interrupt(e) {
    if (e.kind === K.HERO) {
      e.wind = null;
      if (e.channel) e.channel = null;
      if (e.recall) this.cancelRecall(e);
    } else {
      e.windup = null;
    }
  }
  canAct(e) {
    return !e.dead && !this.hasEff(e, 'stun') && !this.hasEff(e, 'airborne');
  }
  canMove(e) {
    return this.canAct(e) && !this.hasEff(e, 'root') && !e.dash;
  }
  addShield(e, amount, dur, src) {
    const hp = src && src.kind === K.HERO ? 1 + src.stats.healPower : 1;
    e.shields.push({ amt: amount * hp, until: this.t + dur });
  }
  shieldAmt(e) {
    let s = 0;
    for (const sh of e.shields) if (sh.until > this.t) s += sh.amt;
    return s;
  }

  // ---------------------------------------------------------------- targeting
  isEnemy(a, b) {
    return a.team !== b.team;
  }
  canHit(e) {
    return !e.dead && !this.hasEff(e, 'invuln') && !e.resetting;
  }
  canTarget(e, team) {
    if (!this.canHit(e)) return false;
    if (e.team !== team && this.hasEff(e, 'stealth')) return false;
    return true;
  }
  structProtected(s) {
    if (s.kind === K.SPIRE) return this.structs.some((o) => o.team === s.team && o.kind === K.TOWER && o.tier === 3 && !o.dead);
    if (s.tier === 3) return !this.structs.some((o) => o.team === s.team && o.kind === K.TOWER && o.tier === 2 && o.dead);
    if (s.tier === 2) return this.structs.some((o) => o.team === s.team && o.kind === K.TOWER && o.tier === 1 && o.lane === s.lane && !o.dead);
    return false;
  }

  // Enemies of `team` within radius. opts: {heroes, units, structs, monsters}
  enemiesNear(team, x, z, r, opts = {}) {
    const out = [];
    const { heroes = true, units = true, structs = false, monsters = true, targetableOnly = false } = opts;
    const test = (e) => {
      if (e.team === team || e.dead) return;
      if (!this.canHit(e)) return;
      if (targetableOnly && !this.canTarget(e, team)) return;
      const rr = r + (e.radius || 0);
      if (dist2(x, z, e.x, e.z) <= rr * rr) out.push(e);
    };
    if (heroes) for (const e of this.heroes) test(e);
    if (units) for (const e of this.units) { if (!monsters && e.team === 2) continue; test(e); }
    if (structs) for (const e of this.structs) test(e);
    return out;
  }
  alliesNear(team, x, z, r, heroesOnly = true) {
    const out = [];
    for (const e of this.heroes) if (e.team === team && !e.dead && dist2(x, z, e.x, e.z) <= r * r) out.push(e);
    if (!heroesOnly) for (const e of this.units) if (e.team === team && !e.dead && dist2(x, z, e.x, e.z) <= r * r) out.push(e);
    return out;
  }
  enemiesInLine(team, x, z, dx, dz, len, width, opts = {}) {
    const ex = x + dx * len, ez = z + dz * len;
    const cand = this.enemiesNear(team, (x + ex) / 2, (z + ez) / 2, len / 2 + width + 2, opts);
    return cand.filter((e) => segDist2(e.x, e.z, x, z, ex, ez) <= (width / 2 + e.radius) ** 2);
  }

  // aim assist: best enemy within range & cone of the aim direction
  assistTarget(h, dx, dz, range, cone = 0.6, opts = {}) {
    const { structs = true, heroesFirst = false } = opts;
    let best = null, bestScore = Infinity;
    const consider = (e) => {
      if (e.team === h.team || !this.canTarget(e, h.team)) return;
      const ox = e.x - h.x, oz = e.z - h.z;
      const d = Math.hypot(ox, oz);
      if (d - e.radius > range) return;
      if (d < 0.01) { best = e; bestScore = -1; return; }
      const cos = (ox * dx + oz * dz) / d;
      const ang = Math.acos(clamp(cos, -1, 1));
      const allowance = cone + Math.atan2(e.radius, d);
      if (ang > allowance && d > e.radius + h.radius + 0.6) return;
      let score = ang / allowance + (d / range) * 0.4;
      if (heroesFirst && e.kind === K.HERO) score -= 0.6;
      if (e.kind === K.TOWER || e.kind === K.SPIRE) score += 0.3;
      if (score < bestScore) { bestScore = score; best = e; }
    };
    for (const e of this.heroes) consider(e);
    for (const e of this.units) consider(e);
    if (structs) for (const e of this.structs) consider(e);
    return best;
  }

  // ---------------------------------------------------------------- damage
  damage(src, tgt, amount, type = 'phys', opts = {}) {
    if (!tgt || tgt.dead || amount <= 0) return 0;
    if (this.hasEff(tgt, 'invuln') || tgt.resetting) return 0;
    if ((tgt.kind === K.TOWER || tgt.kind === K.SPIRE) && this.structProtected(tgt)) return 0;
    let mult = 1;
    if (src) {
      if (src.kind === K.HERO) {
        mult *= 1 + this.drakeStacks[src.team] * 0.06;
        if (src.heroId === 'vex' && tgt.kind === K.HERO && tgt.hp / tgt.maxHp < 0.4) mult *= 1.1;
        if (src.heroId === 'ignis' && this.hasEff(tgt, 'burn')) mult *= 1.06;
      }
      if (this.hasEff(src, 'chill')) mult *= 0.9;
      if (src.structMult && (tgt.kind === K.TOWER || tgt.kind === K.SPIRE)) mult *= src.structMult;
      if (src.empowered && tgt.kind !== K.HERO) mult *= 1.5;
    }
    if (tgt.kind === K.HERO) {
      mult *= 1 - this.maxEff(tgt, 'dr');
      if (tgt.heroId === 'kaelen' && this.structs.some((s) => s.team === tgt.team && !s.dead && dist2(s.x, s.z, tgt.x, tgt.z) < 15 * 15)) mult *= 0.92;
    }
    let resist = 0;
    if (type === 'phys') resist = (tgt.kind === K.HERO ? tgt.stats.armor : tgt.armor || 0) * (1 - (src?.stats?.armorPen || 0));
    else if (type === 'magic') resist = (tgt.kind === K.HERO ? tgt.stats.mr : tgt.mr || 0) * (1 - (src?.stats?.magicPen || 0));
    let dmg = amount * mult * (100 / (100 + Math.max(0, resist)));
    const raw = dmg;
    // shields
    for (const sh of tgt.shields) {
      if (sh.until <= this.t || dmg <= 0) continue;
      const a = Math.min(sh.amt, dmg);
      sh.amt -= a;
      dmg -= a;
    }
    tgt.shields = tgt.shields.filter((s) => s.amt > 0.5 && s.until > this.t);
    tgt.hp -= dmg;
    tgt.lastDamaged = this.t;
    if (tgt.recall) this.cancelRecall(tgt);
    // stealth breaks when Vex takes damage? no — only on attack.
    if (src) {
      const owner = src.owner ? this.ents.get(src.owner) : src;
      const credit = owner && owner.kind === K.HERO ? owner : src;
      tgt.dmgLog.set(credit.id, this.t);
      if (credit.kind === K.HERO) {
        credit.dmgDealt += raw;
        if (tgt.kind === K.HERO) {
          credit.lastAttackedHero = this.t;
          this.lastHelpCall.set(credit.id, { t: this.t, victim: tgt.id });
        }
      }
      if (src.kind === K.HERO && type === 'phys' && !opts.ability) {
        let ls = src.stats.lifesteal;
        if (src.heroId === 'brakka') ls += this.hasEff(src, 'rage') ? 0.08 : 0.04;
        if (ls > 0) this.heal(src, src, raw * ls, true);
      }
      if (tgt.ai === 'monster' && !tgt.target && credit.kind !== undefined) this.aggroCamp(tgt, credit);
    }
    const showNumber = tgt.kind === K.HERO || src?.kind === K.HERO || (src?.owner && this.ents.get(src.owner)?.kind === K.HERO);
    if (showNumber) this.emit({ e: 'dmg', i: tgt.id, s: src ? (src.owner || src.id) : 0, a: Math.round(raw), y: type === 'phys' ? 0 : type === 'magic' ? 1 : 2 });
    if (tgt.hp <= 0) this.kill(tgt, src);
    return raw;
  }

  heal(src, tgt, amount, silent = false) {
    if (!tgt || tgt.dead || amount <= 0) return;
    const hp = src && src.kind === K.HERO && src !== tgt ? 1 + src.stats.healPower : 1;
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount * hp);
    const gained = tgt.hp - before;
    if (!silent && gained > 1) this.emit({ e: 'heal', i: tgt.id, a: Math.round(gained) });
    if (src && src.heroId === 'aurelia' && tgt !== src && tgt.kind === K.HERO) this.addEffect(tgt, 'haste', 1.5, 0.15);
  }

  aggroCamp(m, attacker) {
    const camp = this.camps[m.camp];
    if (!camp) return;
    for (const u of camp.alive) if (!u.dead && !u.target) { u.target = attacker.id; u.aggroAt = this.t; }
  }

  // ---------------------------------------------------------------- deaths
  kill(e, src) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    e.dash = null;
    e.wind = null;
    e.windup = null;
    e.channel = null;
    if (e.recall) e.recall = null;
    this.emit({ e: 'death', i: e.id });
    const owner = src && src.owner ? this.ents.get(src.owner) : src;
    // mordrin passive
    for (const h of this.heroes) {
      if (h.heroId === 'mordrin' && !h.dead && h.team !== e.team && dist2(h.x, h.z, e.x, e.z) < 144) this.heal(h, h, h.maxHp * 0.02, true);
    }
    if (e.kind === K.HERO) return this.killHero(e, owner);
    if (e.kind === K.TOWER || e.kind === K.SPIRE) return this.killStruct(e, owner);
    // minion / monster / summon
    const def = e.stats;
    if (def && (def.gold || def.xp)) {
      const killerHero = owner && owner.kind === K.HERO ? owner : null;
      if (killerHero) {
        const g = Math.round(def.gold * (1 + Math.min(1, this.t / 1200) * 0.5));
        this.giveGold(killerHero, g, e.x, e.z);
        killerHero.cs++;
      }
      const xpTeam = e.team === 2 ? (killerHero ? killerHero.team : -1) : 1 - e.team;
      if (xpTeam >= 0) {
        const near = this.heroes.filter((h) => h.team === xpTeam && !h.dead && dist2(h.x, h.z, e.x, e.z) < XP_RANGE * XP_RANGE);
        if (near.length) {
          const share = (def.xp * (near.length > 1 ? 1.25 : 1)) / near.length;
          for (const h of near) this.giveXp(h, share);
        }
      }
    }
    if (e.ai === 'monster') this.onMonsterDeath(e, owner);
  }

  killHero(v, killer) {
    v.d++;
    v.deathStreak++;
    const shutdown = v.streak >= 3;
    const bounty = Math.round(Math.min(700, 300 + Math.max(0, v.streak - 1) * 60) * Math.max(0.35, 1 - 0.15 * Math.max(0, v.deathStreak - 2)));
    v.streak = 0;
    v.respawnAt = this.t + (RESPAWN_BASE + v.level * RESPAWN_PER_LEVEL) * (this.t > 900 ? 1.25 : 1);
    v.effects = [];
    v.shields = [];
    v.recall = null;
    // credit: killer hero or most recent enemy hero damage within 10s
    let kh = killer && killer.kind === K.HERO && killer.team !== v.team ? killer : null;
    const assists = [];
    for (const [hid, time] of v.dmgLog) {
      if (this.t - time > 10) continue;
      const h = this.ents.get(hid);
      if (!h || h.kind !== K.HERO || h.team === v.team) continue;
      if (!kh) kh = h;
      else if (h !== kh) assists.push(h);
    }
    // supports get assists for healing/shielding allies nearby (simple: allied heroes within 14 of the killer)
    if (kh) {
      for (const h of this.heroes) {
        if (h.team === kh.team && h !== kh && !h.dead && !assists.includes(h) && dist2(h.x, h.z, v.x, v.z) < 14 * 14) assists.push(h);
      }
    }
    v.dmgLog.clear();
    if (kh) {
      kh.k++;
      kh.streak++;
      kh.deathStreak = 0;
      this.kills[kh.team]++;
      this.giveGold(kh, bounty + (this.firstBlood ? 0 : 100), v.x, v.z);
      const aGold = assists.length ? Math.round((bounty * 0.5) / assists.length) : 0;
      for (const a of assists) { a.a++; this.giveGold(a, aGold, v.x, v.z); }
      const xp = 110 + 35 * v.level;
      const group = [kh, ...assists.filter((a) => dist2(a.x, a.z, v.x, v.z) < 22 * 22)];
      for (const h of group) this.giveXp(h, xp / group.length * (group.length > 1 ? 1.3 : 1));
      // vex reset
      if (kh.heroId === 'vex') kh.cds.q = this.t;
      for (const a of assists) if (a.heroId === 'vex') a.cds.q = this.t;
      // multi-kills
      if (this.t - kh.lastKillT < 10) kh.multi++; else kh.multi = 1;
      kh.lastKillT = this.t;
      this.emit({ e: 'kill', k: kh.id, v: v.id, as: assists.map((a) => a.id) });
      if (!this.firstBlood) { this.firstBlood = true; this.announce('First Blood', kh.team, 'fb', kh.id); }
      else if (kh.multi >= 2) this.announce(['', '', 'Double Kill', 'Triple Kill', 'Quadra Kill', 'Penta Kill'][Math.min(5, kh.multi)], kh.team, 'multi', kh.id);
      else if (shutdown) this.announce('Shutdown', kh.team, 'shutdown', kh.id);
      else if (kh.streak === 3) this.announce('Killing Spree', kh.team, 'spree', kh.id);
      else if (kh.streak === 5) this.announce('Unstoppable', kh.team, 'spree', kh.id);
      else if (kh.streak === 7) this.announce('Legendary', kh.team, 'spree', kh.id);
      if (this.heroes.filter((h) => h.team === v.team).every((h) => h.dead) && this.heroes.filter((h) => h.team === v.team).length >= 3) {
        this.announce('Ace', kh.team, 'ace', kh.id);
      }
    } else {
      this.kills[1 - v.team]++;
      this.emit({ e: 'kill', k: killer ? killer.id : 0, v: v.id, as: [] });
    }
  }

  killStruct(s, killer) {
    s.solid = false;
    this.emit({ e: 'struct', i: s.id, tm: s.team });
    const enemyTeam = 1 - s.team;
    if (s.kind === K.SPIRE) {
      this.over = true;
      this.winner = enemyTeam;
      this.announce('Victory', enemyTeam, 'victory');
      this.emit({ e: 'over', w: enemyTeam });
      return;
    }
    for (const h of this.heroes) if (h.team === enemyTeam) this.giveGold(h, 125, h.x, h.z, true);
    if (killer && killer.kind === K.HERO) this.giveGold(killer, 100, s.x, s.z);
    this.announce(s.tier === 3 ? 'Guardian Destroyed' : 'Tower Destroyed', enemyTeam, 'tower');
  }

  onMonsterDeath(m, killer) {
    const camp = this.camps[m.camp];
    if (!camp) return;
    camp.alive = camp.alive.filter((u) => !u.dead);
    if (camp.alive.length === 0) {
      camp.respawnAt = this.t + (camp.type === 'drake' ? 180 : camp.type === 'warden' ? 240 : 75);
      const team = killer ? killer.team : -1;
      if (team === BLUE || team === RED) {
        if (camp.type === 'drake') {
          this.drakeStacks[team] = Math.min(4, this.drakeStacks[team] + 1);
          for (const h of this.heroes) if (h.team === team) this.giveGold(h, 120, h.x, h.z, true);
          this.announce(`Drake Slain · Ember Soul ${this.drakeStacks[team]}/4`, team, 'boss');
        } else if (camp.type === 'warden') {
          this.wardenBuff[team] = this.t + 120;
          for (const h of this.heroes) if (h.team === team) { this.giveGold(h, 200, h.x, h.z, true); this.recalc(h); }
          this.announce("Warden Slain · Warden's Blessing", team, 'boss');
        }
      }
    }
  }

  giveGold(h, amount, x, z, silent = false) {
    h.gold += amount;
    h.totalGold += amount;
    if (!silent) this.emit({ e: 'gold', i: h.id, a: Math.round(amount), x, z });
  }
  giveXp(h, amount) {
    if (h.level >= MAX_LEVEL) return;
    h.xp += amount;
    while (h.level < MAX_LEVEL && h.xp >= XP_TABLE[h.level]) {
      h.level++;
      this.recalc(h);
      h.hp = Math.min(h.maxHp, h.hp + h.def.stats.hpG);
      this.emit({ e: 'lvl', i: h.id, l: h.level });
      if (h.level === ULT_LEVEL) this.emit({ e: 'ult', i: h.id });
    }
  }

  announce(text, team, kind, who = 0) {
    this.emit({ e: 'ann', t: text, tm: team, k: kind, w: who });
  }

  emit(ev) {
    this.events.push(ev);
    if (ev.e === 'tele') this.teles.push({ ...ev, until: this.t + ev.d });
  }

  after(delay, fn) {
    this.timers.push({ at: this.t + delay, fn });
  }

  // ---------------------------------------------------------------- projectiles & zones
  spawnProj(p) {
    const proj = {
      id: this.id(), team: p.owner.team, owner: p.owner.id, x: p.x ?? p.owner.x, z: p.z ?? p.owner.z,
      dx: p.dx, dz: p.dz, speed: p.speed, range: p.range, traveled: 0, radius: p.width ? p.width / 2 : 0.35,
      pierce: !!p.pierce, hitSet: p.hitSet || new Set(), target: p.target || 0, structs: !!p.structs, heroesOnly: !!p.heroesOnly,
      onHit: p.onHit, onEnd: p.onEnd, vis: p.vis || 'bolt', dead: false, homing: !!p.target,
      monsters: p.monsters !== false,
    };
    this.projs.push(proj);
    this.emit({
      e: 'proj', p: proj.id, v: proj.vis, x: +proj.x.toFixed(2), z: +proj.z.toFixed(2), dx: +proj.dx.toFixed(3), dz: +proj.dz.toFixed(3),
      sp: proj.speed, r: proj.range, w: +(proj.radius * 2).toFixed(2), tg: proj.target, tm: proj.team, o: proj.owner,
    });
    return proj;
  }

  tickProjs() {
    for (const p of this.projs) {
      if (p.dead) continue;
      const owner = this.ents.get(p.owner);
      if (p.homing) {
        const tg = this.ents.get(p.target);
        if (!tg || tg.dead) { this.endProj(p, false); continue; }
        const dx = tg.x - p.x, dz = tg.z - p.z;
        const d = Math.hypot(dx, dz);
        const step = p.speed * DT;
        if (d <= step + tg.radius * 0.6) {
          p.x = tg.x; p.z = tg.z;
          if (this.canHit(tg) && p.onHit) p.onHit(this, p, tg, owner);
          this.endProj(p, true);
          continue;
        }
        p.dx = dx / d; p.dz = dz / d;
        p.x += p.dx * step; p.z += p.dz * step;
        p.traveled += step;
        if (p.traveled > p.range * 3) this.endProj(p, false);
        continue;
      }
      const sub = 3;
      const step = (p.speed * DT) / sub;
      for (let s = 0; s < sub && !p.dead; s++) {
        p.x += p.dx * step; p.z += p.dz * step;
        p.traveled += step;
        const hit = this.projCollide(p);
        if (hit) {
          for (const h of hit) {
            p.hitSet.add(h.id);
            if (p.onHit) p.onHit(this, p, h, owner);
            if (!p.pierce) { this.endProj(p, true); break; }
          }
        }
        if (!p.dead && p.traveled >= p.range) {
          if (p.onEnd) p.onEnd(this, p, owner);
          this.endProj(p, false);
        }
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }

  projCollide(p) {
    let out = null;
    const test = (e) => {
      if (e.team === p.team || e.dead || p.hitSet.has(e.id) || !this.canHit(e)) return;
      const rr = p.radius + e.radius;
      if (dist2(p.x, p.z, e.x, e.z) <= rr * rr) (out ||= []).push(e);
    };
    for (const e of this.heroes) test(e);
    if (!p.heroesOnly) {
      for (const e of this.units) { if (!p.monsters && e.team === 2) continue; test(e); }
      if (p.structs) for (const e of this.structs) test(e);
    }
    if (out && out.length > 1 && !p.pierce) {
      out.sort((a, b) => dist2(a.x, a.z, p.x - p.dx * 2, p.z - p.dz * 2) - dist2(b.x, b.z, p.x - p.dx * 2, p.z - p.dz * 2));
      out.length = 1;
    }
    return out;
  }

  endProj(p, hit) {
    if (p.dead) return;
    p.dead = true;
    this.emit({ e: 'pend', p: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), h: hit ? 1 : 0 });
  }

  spawnZone(z) {
    const zone = { id: this.id(), nextTick: this.t + (z.firstDelay ?? 0), ...z, until: this.t + z.dur };
    this.zones.push(zone);
    return zone;
  }

  tickZones() {
    for (const z of this.zones) {
      if (z.follow) {
        const f = this.ents.get(z.follow);
        if (!f || f.dead) { z.until = 0; } else { z.x = f.x; z.z = f.z; }
      }
      if (this.t >= z.nextTick && this.t <= z.until) {
        z.nextTick += z.every;
        z.onTick(this, z);
      }
    }
    this.zones = this.zones.filter((z) => z.until > this.t);
  }

  // ---------------------------------------------------------------- dashes
  startDash(e, tx, tz, dur, opts = {}) {
    e.dash = {
      sx: e.x, sz: e.z, ex: tx, ez: tz, t0: this.t, dur, hit: new Set(), onTick: opts.onTick, onEnd: opts.onEnd,
      ignoreWalls: !!opts.ignoreWalls, invuln: !!opts.invuln, arc: opts.arc || 0,
    };
    if (opts.invuln) this.addEffect(e, 'invuln', dur * 0.75);
    if (e.recall) this.cancelRecall(e);
    this.emit({ e: 'dash', i: e.id, x: +tx.toFixed(2), z: +tz.toFixed(2), d: dur, a: opts.arc || 0 });
  }

  tickDash(e) {
    const d = e.dash;
    const p = Math.min(1, (this.t - d.t0) / d.dur);
    let nx = d.sx + (d.ex - d.sx) * p, nz = d.sz + (d.ez - d.sz) * p;
    if (!d.ignoreWalls) [nx, nz] = resolveStatic(nx, nz, e.radius, this.structs);
    const mdx = nx - e.x, mdz = nz - e.z;
    if (Math.abs(mdx) + Math.abs(mdz) > 0.001) e.rot = Math.atan2(mdx, mdz);
    e.x = nx; e.z = nz;
    if (d.onTick) d.onTick(this, e, d);
    if (p >= 1 || !e.dash) {
      const end = e.dash;
      e.dash = null;
      if (end && end.ignoreWalls) [e.x, e.z] = resolveStatic(e.x, e.z, e.radius, this.structs);
      if (end && end.onEnd) end.onEnd(this, e, end);
      if (e.heroId === 'zephyr') this.addEffect(e, 'haste', 1.2, 0.2);
    }
  }

  // ---------------------------------------------------------------- recall & shop
  startRecall(h) {
    if (h.recall || h.dead || h.dash) return;
    const fast = this.wardenBuff[h.team] > this.t;
    h.recall = { until: this.t + (fast ? 1.5 : RECALL_TIME) };
    this.emit({ e: 'recall', i: h.id, s: 1, d: fast ? 1.5 : RECALL_TIME });
  }
  cancelRecall(h) {
    if (!h.recall) return;
    h.recall = null;
    this.emit({ e: 'recall', i: h.id, s: 0 });
  }
  inShop(h) {
    const [fx, fz] = FOUNTAIN_POS[h.team];
    return h.dead || dist2(h.x, h.z, fx, fz) < SHOP_RADIUS * SHOP_RADIUS;
  }
  buy(h, itemId) {
    const it = ITEM_BY_ID[itemId];
    if (!it || !this.inShop(h) || h.gold < it.cost) return false;
    if (it.unique && h.items.includes(itemId)) return false;
    if (h.items.length >= MAX_ITEMS) {
      // auto-sell the cheapest basic item to make room for an upgrade
      if (it.tier < 2) return false;
      const basics = h.items.map((id, i) => ({ id, i, it: ITEM_BY_ID[id] })).filter((x) => x.it.tier === 1 && x.id !== 'boots');
      if (!basics.length) return false;
      const sell = basics[0];
      if (h.gold + sell.it.cost * SELL_RATIO < it.cost) return false;
      h.items.splice(sell.i, 1);
      h.gold += Math.round(sell.it.cost * SELL_RATIO);
    }
    h.gold -= it.cost;
    h.items.push(itemId);
    this.recalc(h);
    this.emit({ e: 'buy', i: h.id, it: itemId });
    return true;
  }
  sell(h, idx) {
    const id = h.items[idx];
    if (!id || !this.inShop(h)) return false;
    h.items.splice(idx, 1);
    h.gold += Math.round(ITEM_BY_ID[id].cost * SELL_RATIO);
    this.recalc(h);
    return true;
  }
  nextBuildItem(h) {
    for (const id of h.def.build) if (!h.items.includes(id)) return id;
    return null;
  }

  // ---------------------------------------------------------------- hero tick
  tickHero(h) {
    if (h.dead) {
      if (this.t >= h.respawnAt && !this.over) this.respawn(h);
      return;
    }
    const inp = h.input;
    const st = h.stats;
    // regen + fountain
    const [fx, fz] = FOUNTAIN_POS[h.team];
    const atFountain = dist2(h.x, h.z, fx, fz) < FOUNTAIN_RADIUS * FOUNTAIN_RADIUS;
    let regen = st.regen;
    if (atFountain) regen += h.maxHp * 0.12;
    if (h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + regen * DT);
    // buffered cast after a dash
    if (h.dash) {
      this.tickDash(h);
      for (const c of inp.casts) if (c !== 'b') h.queued = { slot: c, ax: inp.ax, az: inp.az, until: this.t + 0.35 };
      inp.casts.length = 0;
      return;
    }
    const acting = this.canAct(h);
    let wantsCast = inp.casts.slice();
    inp.casts.length = 0;
    if (h.queued && this.t <= h.queued.until && acting) { wantsCast.unshift(h.queued.slot); inp.ax = h.queued.ax; inp.az = h.queued.az; }
    h.queued = null;

    if (acting) {
      for (const slot of wantsCast) {
        if (slot === 'b') { this.startRecall(h); continue; }
        if (slot === 'd') { this.dodge(h); if (h.dash) break; continue; }
        this.tryCast(h, slot);
        if (h.dash) break;
      }
      if (h.dash) return;
      // basic attack
      if (inp.atk && !h.wind && this.t >= h.atkReady && !h.channel?.lock) {
        const as = this.attackSpeed(h);
        const windup = clamp(0.32 / as, 0.1, 0.3);
        h.wind = { at: this.t + windup, ax: inp.ax, az: inp.az };
        h.atkReady = this.t + 1 / as;
        const [dx, dz] = this.aimDir(h, inp.ax, inp.az);
        h.rot = Math.atan2(dx, dz);
        if (h.recall) this.cancelRecall(h);
        this.emit({ e: 'atk', i: h.id, x: +inp.ax.toFixed(1), z: +inp.az.toFixed(1), w: +windup.toFixed(2) });
      }
    }
    // movement
    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (this.canMove(h) && ml > 0.05) {
      let sp = this.moveSpeed(h);
      if (h.wind) sp *= 0.55;
      if (h.channel && h.channel.slow) sp *= 1 - h.channel.slow;
      let nx = h.x + mx * sp * DT, nz = h.z + mz * sp * DT;
      [nx, nz] = resolveStatic(nx, nz, h.radius, this.structs);
      h.vx = (nx - h.x) / DT; h.vz = (nz - h.z) / DT;
      h.x = nx; h.z = nz;
      if (!h.wind) h.rot = Math.atan2(mx, mz);
      if (h.recall && ml > 0.2) this.cancelRecall(h);
    } else {
      h.vx = 0; h.vz = 0;
    }
    if (h.wind) {
      const [dx, dz] = this.aimDir(h, h.wind.ax, h.wind.az);
      h.rot = Math.atan2(dx, dz);
      if (this.t >= h.wind.at) { const w = h.wind; h.wind = null; this.resolveAttack(h, w.ax, w.az); }
    }
    if (h.channel) {
      const c = h.channel;
      if (this.t >= c.nextTick) { c.nextTick += c.every; c.onTick(this, h, c); }
      if (this.t >= c.until) h.channel = null;
    }
    if (h.recall && this.t >= h.recall.until) {
      h.recall = null;
      h.x = fx; h.z = fz;
      this.emit({ e: 'recall', i: h.id, s: 2 });
      this.emit({ e: 'tp', i: h.id, x: fx, z: fz });
    }
  }

  aimDir(h, ax, az) {
    let dx = ax - h.x, dz = az - h.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.2) return [Math.sin(h.rot), Math.cos(h.rot)];
    return [dx / l, dz / l];
  }

  resolveAttack(h, ax, az) {
    let [dx, dz] = this.aimDir(h, ax, az);
    const st = h.stats;
    const range = st.range;
    const tgt = this.assistTarget(h, dx, dz, range + (h.def.ranged ? 1.5 : 0.8), h.def.ranged ? 0.42 : 0.75, { heroesFirst: false });
    const breakStealth = () => {
      if (this.hasEff(h, 'stealth')) { this.clearEff(h, ['stealth']); this.emit({ e: 'fx', v: 'unveil', x: h.x, z: h.z, i: h.id }); }
    };
    let bonus = 0;
    if (h.veilEmpower) {
      bonus = h.heroId === 'vex' ? (h.def.e.base + h.def.e.lvl * (h.level - 1) + h.def.e.ad * st.ad) : 0;
      h.veilEmpower = false;
    }
    breakStealth();
    if (h.def.ranged) {
      if (tgt) { dx = tgt.x - h.x; dz = tgt.z - h.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
      const a = h.def.atk;
      this.spawnProj({
        owner: h, dx, dz, speed: a.speed, range: range + 2, width: 0.7, structs: true, target: tgt ? tgt.id : 0, vis: a.vis,
        onHit: (w, p, t, o) => { if (o && !o.dead) w.damage(o, t, o.stats.ad + bonus, 'phys'); },
      });
    } else {
      if (tgt) {
        const ang = Math.atan2(tgt.x - h.x, tgt.z - h.z);
        h.rot = ang;
        this.damage(h, tgt, st.ad + bonus, 'phys');
        this.emit({ e: 'fx', v: 'hit', x: +tgt.x.toFixed(2), z: +tgt.z.toFixed(2), i: tgt.id, s: h.id });
      } else {
        this.emit({ e: 'fx', v: 'whiff', x: +(h.x + dx * 2).toFixed(2), z: +(h.z + dz * 2).toFixed(2), i: h.id });
      }
    }
  }

  dodge(h) {
    if (this.t < h.cds.d || !this.canMove(h)) return;
    let dx = h.input.mx, dz = h.input.mz;
    let l = Math.hypot(dx, dz);
    if (l < 0.2) { dx = Math.sin(h.rot); dz = Math.cos(h.rot); l = 1; }
    dx /= l; dz /= l;
    h.cds.d = this.t + DODGE_CD;
    h.wind = null;
    this.startDash(h, h.x + dx * DODGE_DIST, h.z + dz * DODGE_DIST, DODGE_TIME, { invuln: true });
    this.emit({ e: 'fx', v: 'dodge', x: h.x, z: h.z, i: h.id });
  }

  tryCast(h, slot) {
    const spec = h.def[slot];
    if (!spec) return false;
    if (this.t < h.cds[slot]) return false;
    if (slot === 'r' && h.level < ULT_LEVEL) return false;
    if (h.channel?.lock) return false;
    const impl = ABILITIES[h.heroId]?.[slot];
    if (!impl) return false;
    const inp = h.input;
    const [dx, dz] = this.aimDir(h, inp.ax, inp.az);
    const aimDist = Math.hypot(inp.ax - h.x, inp.az - h.z);
    const ok = impl(this, h, { dx, dz, ax: inp.ax, az: inp.az, dist: aimDist, spec });
    if (ok === false) return false;
    h.wind = null;
    if (h.recall) this.cancelRecall(h);
    if (slot !== 'e' || h.heroId !== 'vex') {
      if (this.hasEff(h, 'stealth')) { this.clearEff(h, ['stealth']); h.veilEmpower = false; }
    }
    const cd = spec.cd * (1 - h.stats.cdr) * (slot === 'r' ? 1 - 0.02 * (h.level - 1) : 1 - 0.015 * (h.level - 1));
    h.cds[slot] = this.t + cd;
    h.rot = Math.atan2(dx, dz);
    h.casts++;
    this.emit({ e: 'cast', i: h.id, s: slot, x: +inp.ax.toFixed(1), z: +inp.az.toFixed(1) });
    // passives
    if (h.heroId === 'sylva') this.addEffect(h, 'haste', 1.5, 0.2);
    if (h.heroId === 'lyra' && h.casts % 4 === 0 && slot !== 'r' && h.cds.r > this.t) h.cds.r -= (h.cds.r - this.t) * 0.2;
    return true;
  }

  respawn(h) {
    const [fx, fz] = FOUNTAIN_POS[h.team];
    h.dead = false;
    h.hp = h.maxHp;
    h.x = fx + (this.rand() - 0.5) * 3;
    h.z = fz + (this.rand() - 0.5) * 3;
    h.effects = [];
    h.shields = [];
    h.wind = null;
    h.dash = null;
    this.emit({ e: 'spawn', i: h.id, x: h.x, z: h.z });
  }

  // ---------------------------------------------------------------- structures
  tickStruct(s) {
    if (s.dead || s.kind === K.SPIRE) return;
    if (s.hp <= 0) return;
    const range = 13.5;
    if (this.t < s.atkReady) return;
    let tgt = s.target ? this.ents.get(s.target) : null;
    const valid = (e) => e && !e.dead && this.canTarget(e, s.team) && e.team !== s.team && dist2(s.x, s.z, e.x, e.z) <= (range + e.radius) ** 2;
    if (!valid(tgt)) tgt = null;
    // call for help: enemy hero hitting an allied hero nearby
    for (const h of this.heroes) {
      if (h.team === s.team || !valid(h)) continue;
      const hc = this.lastHelpCall.get(h.id);
      if (hc && this.t - hc.t < 1.5) {
        const victim = this.ents.get(hc.victim);
        if (victim && victim.team === s.team && dist2(victim.x, victim.z, s.x, s.z) < (range + 4) ** 2) { tgt = h; break; }
      }
    }
    if (!tgt) {
      let best = null, bd = Infinity;
      for (const u of this.units) {
        if (u.team === 2 || !valid(u)) continue;
        const d = dist2(s.x, s.z, u.x, u.z);
        if (d < bd) { bd = d; best = u; }
      }
      if (!best) for (const h of this.heroes) {
        if (!valid(h)) continue;
        const d = dist2(s.x, s.z, h.x, h.z);
        if (d < bd) { bd = d; best = h; }
      }
      tgt = best;
    }
    if (!tgt) { s.target = null; s.streak = 0; return; }
    s.target = tgt.id;
    if (tgt.kind === K.HERO) {
      if (s.streakTarget === tgt.id) s.streak++; else { s.streakTarget = tgt.id; s.streak = 0; }
    } else { s.streak = 0; s.streakTarget = null; }
    s.atkReady = this.t + 1.0;
    const minute = this.t / 60;
    const heroDmg = (150 + 7 * minute) * Math.min(2.2, 1 + 0.35 * s.streak);
    this.spawnProj({
      owner: s, x: s.x, z: s.z, dx: 0, dz: 1, speed: 34, range: 30, target: tgt.id, vis: s.team === 0 ? 'towerB' : 'towerR',
      onHit: (w, p, t) => {
        if (t.kind === K.HERO) w.damage(s, t, heroDmg, 'phys');
        else w.damage(s, t, t.kind === K.SIEGE ? 160 : 230, 'true');
      },
    });
  }

  // ---------------------------------------------------------------- spawning
  spawnWave() {
    this.waveCount++;
    const siege = this.waveCount % 3 === 0;
    const surge = this.t >= SURGE_TIME;
    for (const team of [BLUE, RED]) {
      for (const lane of LANE_NAMES) {
        const kinds = [K.MELEE, K.MELEE, K.MELEE];
        if (siege) kinds.push(K.SIEGE);
        kinds.push(K.CASTER, K.CASTER, K.CASTER);
        kinds.forEach((kind, i) => this.spawnQueue.push({ at: this.t + i * 0.7, kind, team, lane, surge }));
      }
    }
  }

  spawnMinion({ kind, team, lane, surge }) {
    const path = lanePath(lane, team);
    const base = MINION_STATS[kind];
    const w = this.waveCount;
    const m = surge ? 1.4 : 1;
    const hp = Math.round((base.hp + base.hpW * w) * m);
    const stats = { ...base, dmg: (base.dmg + base.dmgW * w) * m };
    const u = this.addUnit(kind, team, path[0][0] + (this.rand() - 0.5), path[0][1] + (this.rand() - 0.5), {
      ai: 'lane', lane, path, wp: 1, hp, maxHp: hp, armor: base.armor, mr: base.mr, radius: base.radius, speed: base.speed,
      stats, structMult: (base.structMult || 1) * (surge ? 2 : 1),
    });
    if (surge) u.surged = true;
  }

  spawnCamp(camp) {
    const minute = this.t / 60;
    const scale = 1 + 0.05 * minute;
    const defs = {
      wolves: [['wolf', 0, 0, 0], ['wolfSmall', 2.2, 1.4, 1], ['wolfSmall', -2.2, 1.4, 1]],
      golem: [['golem', 0, 0, 0]],
      raptors: [['raptor', 0, 0, 0], ['raptorSmall', 2, 1.5, 1], ['raptorSmall', -2, 1.5, 1], ['raptorSmall', 0, 2.6, 1]],
      drake: [['drake', 0, 0, 0]],
      warden: [['warden', 0, 0, 0]],
    }[camp.type];
    camp.alive = [];
    for (const [key, ox, oz, variant] of defs) {
      const base = MONSTER_STATS[key];
      const hp = Math.round(base.hp * scale * (camp.boss ? 1 + 0.03 * minute : 1));
      const u = this.addUnit(base.kind, 2, camp.pos[0] + ox, camp.pos[1] + oz, {
        ai: 'monster', camp: camp.i, home: [camp.pos[0] + ox, camp.pos[1] + oz], hp, maxHp: hp, armor: base.armor, mr: base.mr,
        radius: base.radius, speed: base.speed, stats: { ...base, dmg: base.dmg * scale }, variant, special: this.t + 5,
      });
      u.rot = Math.atan2(-camp.pos[0], -camp.pos[1]);
      camp.alive.push(u);
    }
    if (camp.boss) this.announce(camp.type === 'drake' ? 'The Ember Drake has awakened' : 'The Ancient Warden has risen', -1, 'bossSpawn');
  }

  // ---------------------------------------------------------------- main tick
  step(inputs) {
    if (inputs) for (const h of this.heroes) if (inputs.has(h.id)) Object.assign(h.input, inputs.get(h.id));
    if (this.over) { this.t += DT; this.tick++; return; }
    this.t += DT;
    this.tick++;

    // passive gold
    if (this.t > FIRST_WAVE) for (const h of this.heroes) { h.gold += PASSIVE_GOLD * DT; h.totalGold += PASSIVE_GOLD * DT; }
    // waves
    if (this.t >= this.nextWave) { this.spawnWave(); this.nextWave += WAVE_INTERVAL; }
    if (this.t >= SURGE_TIME && !this.surgeAnnounced) { this.surgeAnnounced = true; this.announce('Siege Surge — minions are empowered', -1, 'surge'); }
    if (this.spawnQueue.length) {
      const due = this.spawnQueue.filter((q) => q.at <= this.t);
      if (due.length) {
        this.spawnQueue = this.spawnQueue.filter((q) => q.at > this.t);
        for (const q of due) this.spawnMinion(q);
      }
    }
    for (const camp of this.camps) {
      if (camp.alive.length === 0 && camp.respawnAt && this.t >= camp.respawnAt) { camp.respawnAt = 0; this.spawnCamp(camp); }
    }
    // warden buff expiry -> recalc
    for (const team of [BLUE, RED]) {
      if (this.wardenBuff[team] && this.t >= this.wardenBuff[team]) {
        this.wardenBuff[team] = 0;
        for (const h of this.heroes) if (h.team === team) this.recalc(h);
      }
    }

    if (this.teles.length) this.teles = this.teles.filter((t) => t.until > this.t);
    // bots decide
    for (const h of this.heroes) if (h.bot) botThink(this, h);

    // timers
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.t);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.t);
        for (const t of due) t.fn(this);
      }
    }

    for (const h of this.heroes) this.tickHero(h);
    for (const u of this.units) if (!u.dead) tickUnit(this, u);
    separateUnits(this);
    for (const s of this.structs) this.tickStruct(s);
    this.tickProjs();
    this.tickZones();

    // dots
    for (const list of [this.heroes, this.units]) {
      for (const e of list) {
        if (e.dead) continue;
        for (const f of e.effects) {
          if (f.type === 'burn' || f.type === 'dot') {
            if (f.until <= this.t) continue;
            f.acc = (f.acc || 0) + DT;
            if (f.acc >= 0.5) { f.acc -= 0.5; const src = this.ents.get(f.src); this.damage(src && !src.dead ? src : null, e, f.value * 0.5, 'magic', { ability: true }); }
          }
        }
        if (e.effects.length) e.effects = e.effects.filter((f) => f.until > this.t);
        if (e.shields.length) e.shields = e.shields.filter((s) => s.until > this.t && s.amt > 0.5);
      }
    }

    // fountain lasers
    for (const team of [BLUE, RED]) {
      const [fx, fz] = FOUNTAIN_POS[team];
      for (const h of this.heroes) {
        if (h.team !== team && !h.dead && dist2(h.x, h.z, fx, fz) < FOUNTAIN_RADIUS * FOUNTAIN_RADIUS) {
          this.damage(null, h, 900 * DT, 'true');
          if (this.tick % 10 === 0) this.emit({ e: 'fx', v: 'fountain', x: fx, z: fz, i: h.id, tm: team });
        }
      }
    }

    // cleanup dead units (keep briefly for death anim on client — client handles that)
    if (this.tick % 15 === 0) {
      const before = this.units.length;
      this.units = this.units.filter((u) => {
        if (u.dead || (u.expires && this.t >= u.expires)) { if (!u.dead) { u.dead = true; this.emit({ e: 'death', i: u.id }); } this.remove(u); return false; }
        return true;
      });
      if (before !== this.units.length) for (const c of this.camps) c.alive = c.alive.filter((u) => !u.dead);
    }
  }

  // ---------------------------------------------------------------- serialization
  flagsOf(e) {
    let f = 0;
    if (e.dead) f |= F.DEAD;
    for (const ef of e.effects) {
      if (ef.until <= this.t) continue;
      switch (ef.type) {
        case 'stun': f |= F.STUN; break;
        case 'slow': f |= F.SLOW; break;
        case 'chill': f |= F.CHILL; break;
        case 'root': f |= F.ROOT; break;
        case 'stealth': f |= F.STEALTH; break;
        case 'airborne': f |= F.AIRBORNE; break;
        case 'invuln': f |= F.INVULN; break;
        case 'burn': f |= F.BURN; break;
        case 'haste': f |= F.HASTE; break;
        case 'rage': f |= F.RAGE; break;
        case 'unstoppable': f |= F.RAGE; break;
      }
    }
    if (e.shields.length && this.shieldAmt(e) > 0) f |= F.SHIELD;
    if (e.recall) f |= F.RECALL;
    if (e.dash) f |= F.DASH;
    if (e.channel) f |= F.CHANNEL;
    if (e.empowered || (e.kind === K.HERO && this.wardenBuff[e.team] > this.t)) f |= F.EMPOWER;
    if (e.resetting) f |= F.INVULN;
    if ((e.kind === K.TOWER || e.kind === K.SPIRE) && this.structProtected(e)) f |= F.INVULN;
    return f;
  }

  roster() {
    return this.heroes.map((h) => ({ id: h.id, hero: h.heroId, name: h.name, team: h.team, bot: h.bot, pid: h.playerId }));
  }

  // Compact world state. `me` = hero id of the receiving player (for private data).
  snapshot(meId, full = false) {
    const r = (v) => Math.round(v * 100) / 100;
    const H = this.heroes.map((h) => [h.id, r(h.x), r(h.z), r(h.rot), Math.ceil(h.hp), h.maxHp, Math.ceil(this.shieldAmt(h)), h.level, this.flagsOf(h)]);
    const M = [];
    for (const u of this.units) {
      if (u.dead) continue;
      M.push([u.id, u.kind, u.team, r(u.x), r(u.z), r(u.rot), Math.ceil(u.hp), u.maxHp, this.flagsOf(u), u.variant || 0]);
    }
    const S = this.structs.map((s) => [s.id, Math.ceil(s.hp), this.flagsOf(s)]);
    const snap = { t: r(this.t), H, M, S, k: this.kills.slice(), ds: this.drakeStacks.slice(), wb: this.wardenBuff.map((v) => (v > this.t ? Math.ceil(v - this.t) : 0)) };
    const me = this.ents.get(meId);
    if (me) {
      snap.me = {
        g: Math.floor(me.gold), xp: Math.floor(me.xp), lv: me.level,
        cd: [me.cds.q, me.cds.e, me.cds.r, me.cds.d].map((c) => r(Math.max(0, c - this.t))),
        cdm: ['q', 'e', 'r'].map((s) => r(me.def[s].cd * (1 - me.stats.cdr) * (s === 'r' ? 1 - 0.02 * (me.level - 1) : 1 - 0.015 * (me.level - 1)))).concat([DODGE_CD]),
        it: me.items, rs: me.dead ? r(Math.max(0, me.respawnAt - this.t)) : 0,
        rc: me.recall ? r(Math.max(0, me.recall.until - this.t)) : 0,
        sh: this.inShop(me) ? 1 : 0, ack: me.input.seq,
        st: { ad: Math.round(me.stats.ad), ap: Math.round(me.stats.ap), ar: Math.round(me.stats.armor), mr: Math.round(me.stats.mr), as: r(this.attackSpeed(me)), ms: r(this.moveSpeed(me)), cdr: Math.round(me.stats.cdr * 100), ls: Math.round(me.stats.lifesteal * 100) },
        zs: me.heroId === 'zephyr' && this.t - me.zStackT < 6 ? me.zStacks : 0,
        sp: r(this.moveSpeed(me)),
      };
    }
    if (full || this.tick % 30 === 0) {
      snap.sb = this.heroes.map((h) => [h.id, h.k, h.d, h.a, h.cs, h.items, Math.floor(h.totalGold), h.level]);
      snap.cm = this.camps.map((c) => (c.alive.length ? 0 : Math.max(0, Math.ceil(c.respawnAt - this.t))));
    }
    return snap;
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}

// Filter events per receiving player (bandwidth)
export function eventsFor(events, meId) {
  return events.filter((ev) => {
    if (ev.e === 'gold') return ev.i === meId;
    if (ev.e === 'buy') return ev.i === meId;
    return true;
  });
}
