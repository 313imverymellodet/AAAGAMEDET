// Match wrapper around World: input queues, fixed stepping and per-player snapshots.
// Used verbatim by the Node server (online rooms) and the browser (offline vs bots).
import { World, eventsFor } from './sim/world.js';
import { HEROES } from './heroes.js';
import { BLUE, RED } from './constants.js';

export const TEAM_SIZES = [1, 2, 3, 4, 5];

// Fill both teams with bots around the human picks. humans: [{pid, name, hero, team}]
export function buildSlots(humans, teamSize, difficulty) {
  const slots = [];
  const used = new Set();
  for (const h of humans) {
    slots.push({ playerId: h.pid, name: h.name, heroId: h.hero, team: h.team, bot: false });
    used.add(h.hero + ':' + h.team);
  }
  const pool = HEROES.map((h) => h.id);
  let k = 0;
  for (const team of [BLUE, RED]) {
    const have = slots.filter((s) => s.team === team).length;
    for (let i = have; i < teamSize; i++) {
      // pick a hero not already on this team, rotating through the pool
      let pick = null;
      for (let j = 0; j < pool.length; j++) {
        const cand = pool[(k + j * 3 + (team ? 5 : 0)) % pool.length];
        if (!slots.some((s) => s.team === team && s.heroId === cand)) { pick = cand; break; }
      }
      k += 7;
      slots.push({ playerId: null, name: HEROES.find((h) => h.id === pick).name, heroId: pick, team, bot: true, difficulty });
    }
  }
  return slots;
}

export class Match {
  constructor({ humans, teamSize = 5, difficulty = 'normal', seed = (Math.random() * 1e9) | 0 }) {
    this.slots = buildSlots(humans, teamSize, difficulty);
    this.world = new World({ slots: this.slots, difficulty, seed });
    this.queues = new Map(); // heroId -> input[]
    this.heroByPid = new Map();
    for (const h of this.world.heroes) if (h.playerId != null) { this.heroByPid.set(h.playerId, h); this.queues.set(h.id, []); }
    this.lastEvents = [];
    this.seed = seed;
  }

  heroFor(pid) { return this.heroByPid.get(pid); }

  pushInput(pid, inp) {
    const h = this.heroByPid.get(pid);
    if (!h) return;
    const q = this.queues.get(h.id);
    q.push(sanitizeInput(inp));
    if (q.length > 8) q.splice(0, q.length - 8);
  }

  // Consume one queued input per human hero, merging backlog so we never lag behind.
  tick() {
    const w = this.world;
    for (const h of this.heroByPid.values()) {
      if (h.bot) continue;
      const q = this.queues.get(h.id);
      if (!q.length) { h.input.casts.length = 0; continue; }
      let inp = q.shift();
      while (q.length > 2) {
        const n = q.shift();
        n.c = [...(inp.c || []), ...(n.c || [])];
        n.a = n.a || inp.a;
        inp = n;
      }
      h.input.mx = inp.mx; h.input.mz = inp.mz; h.input.ax = inp.ax; h.input.az = inp.az;
      h.input.atk = !!inp.a;
      for (const c of inp.c || []) h.input.casts.push(c);
      h.input.seq = inp.s;
    }
    w.step();
    this.lastEvents = w.drainEvents();
    return this.lastEvents;
  }

  buy(pid, item) { const h = this.heroByPid.get(pid); if (h) return this.world.buy(h, item); return false; }
  sell(pid, idx) { const h = this.heroByPid.get(pid); if (h) return this.world.sell(h, idx); return false; }

  snapshotFor(pid, events, full = false) {
    const h = this.heroByPid.get(pid);
    const snap = this.world.snapshot(h ? h.id : -1, full);
    snap.ev = eventsFor(events, h ? h.id : -1);
    return snap;
  }

  // Hand a disconnected player's champion to the AI so the match stays fair.
  botify(pid) {
    const h = this.heroByPid.get(pid);
    if (!h) return;
    h.bot = true;
    h.brain = null;
  }
  humanize(pid) {
    const h = this.heroByPid.get(pid);
    if (!h) return;
    h.bot = false;
    this.queues.set(h.id, []);
  }
}

const CASTS = new Set(['q', 'e', 'r', 'd', 'b']);
export function sanitizeInput(i) {
  const num = (v, lim) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
  return {
    s: num(i.s, 1e12) | 0,
    mx: num(i.mx, 1), mz: num(i.mz, 1),
    ax: num(i.ax, 400), az: num(i.az, 400),
    a: i.a ? 1 : 0,
    c: Array.isArray(i.c) ? i.c.filter((c) => CASTS.has(c)).slice(0, 4) : [],
  };
}
