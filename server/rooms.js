// Lobby + match rooms. Each room runs an authoritative Match at 30 Hz and streams
// 15 Hz snapshots to its players. Bots fill empty slots; leavers are handed to the AI.
import { Match } from '../src/shared/match.js';
import { HEROES, HERO_BY_ID } from '../src/shared/heroes.js';
import { SNAPSHOT_EVERY, DT } from '../src/shared/constants.js';
import { eventsFor } from '../src/shared/sim/world.js';
import { startMessage } from '../src/client/net.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS = 10;
const MAX_ROOMS = 200;

let nextPid = 1;
const rooms = new Map();

const cleanName = (n) => String(n || 'Player').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Player';
const validHero = (h) => (HERO_BY_ID[h] ? h : HEROES[0].id);

function newCode() {
  for (let i = 0; i < 100; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    if (!rooms.has(c)) return c;
  }
  return null;
}

class Room {
  constructor(isPublic) {
    this.code = newCode();
    this.public = isPublic;
    this.players = new Map(); // pid -> player
    this.size = 5;
    this.diff = 'normal';
    this.state = 'lobby';
    this.match = null;
    this.evBuf = [];
    this.tickN = 0;
    this.created = Date.now();
    this.emptySince = 0;
  }

  teamCount(t) { let n = 0; for (const p of this.players.values()) if (p.team === t) n++; return n; }
  heroTaken(team, hero, exceptPid) { for (const p of this.players.values()) if (p.team === team && p.hero === hero && p.pid !== exceptPid) return true; return false; }
  freeHero(team, want, exceptPid) {
    if (want && !this.heroTaken(team, want, exceptPid)) return want;
    for (const h of HEROES) if (!this.heroTaken(team, h.id, exceptPid)) return h.id;
    return HEROES[0].id;
  }

  add(conn, name, hero) {
    if (this.state !== 'lobby') return 'That match has already started';
    if (this.players.size >= MAX_PLAYERS) return 'Room is full';
    const team = this.teamCount(0) <= this.teamCount(1) ? 0 : 1;
    if (this.teamCount(team) >= this.size) {
      if (this.teamCount(1 - team) >= this.size) return 'Room is full';
    }
    const t = this.teamCount(team) < this.size ? team : 1 - team;
    const pid = nextPid++;
    const p = { pid, name: cleanName(name), hero: this.freeHero(t, validHero(hero)), team: t, conn, host: this.players.size === 0, msgs: 0 };
    this.players.set(pid, p);
    conn.pid = pid;
    conn.room = this;
    this.broadcastLobby();
    return null;
  }

  remove(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    this.players.delete(pid);
    if (this.state === 'playing' && this.match) this.match.botify(pid);
    if (p.host) { const next = this.players.values().next().value; if (next) next.host = true; }
    if (this.state === 'lobby') this.broadcastLobby();
    if (!this.players.size) this.emptySince = Date.now();
  }

  lobbyFor(p) {
    return {
      t: 'lobby', code: this.code, you: p.pid, host: p.host, size: this.size, diff: this.diff,
      players: [...this.players.values()].map((x) => ({ pid: x.pid, name: x.name, hero: x.hero, team: x.team, host: x.host })),
    };
  }
  broadcastLobby() { for (const p of this.players.values()) p.conn.send(JSON.stringify(this.lobbyFor(p))); }
  broadcast(obj) { const s = JSON.stringify(obj); for (const p of this.players.values()) p.conn.send(s); }

  handle(p, m) {
    switch (m.t) {
      case 'pick':
        if (this.state !== 'lobby' || !HERO_BY_ID[m.hero]) return;
        if (this.heroTaken(p.team, m.hero, p.pid)) { p.conn.send(JSON.stringify({ t: 'err', m: 'A teammate already picked that champion' })); this.broadcastLobby(); return; }
        p.hero = m.hero;
        this.broadcastLobby();
        break;
      case 'team': {
        const t = m.team === 1 ? 1 : 0;
        if (this.state !== 'lobby' || t === p.team) return;
        if (this.teamCount(t) >= this.size) { p.conn.send(JSON.stringify({ t: 'err', m: 'That team is full' })); return; }
        p.team = t;
        p.hero = this.freeHero(t, p.hero, p.pid);
        this.broadcastLobby();
        break;
      }
      case 'cfg':
        if (!p.host || this.state !== 'lobby') return;
        if (m.size != null) {
          const s = Math.max(1, Math.min(5, m.size | 0));
          if (this.teamCount(0) > s || this.teamCount(1) > s) { p.conn.send(JSON.stringify({ t: 'err', m: 'Too many players for that mode' })); return; }
          this.size = s;
        }
        if (['easy', 'normal', 'hard'].includes(m.diff)) this.diff = m.diff;
        this.broadcastLobby();
        break;
      case 'start':
        if (!p.host || this.state !== 'lobby') return;
        this.start();
        break;
      case 'chat': {
        const text = String(m.m || '').slice(0, 120);
        if (text) this.broadcast({ t: 'chat', n: p.name, m: text });
        break;
      }
      case 'in': if (this.match) this.match.pushInput(p.pid, m); break;
      case 'buy': if (this.match && typeof m.it === 'string') this.match.buy(p.pid, m.it); break;
      case 'sell': if (this.match) this.match.sell(p.pid, m.i | 0); break;
    }
  }

  start() {
    this.state = 'playing';
    const humans = [...this.players.values()].map((p) => ({ pid: p.pid, name: p.name, hero: p.hero, team: p.team }));
    this.match = new Match({ humans, teamSize: this.size, difficulty: this.diff });
    for (const p of this.players.values()) p.conn.send(JSON.stringify(startMessage(this.match, p.pid)));
    this.tickN = 0;
    this.evBuf = [];
    this.overAt = 0;
  }

  tick() {
    if (this.state !== 'playing') return;
    const ev = this.match.tick();
    if (ev.length) this.evBuf.push(...ev);
    this.tickN++;
    if (this.tickN % SNAPSHOT_EVERY === 0) {
      const full = this.tickN % 30 === 0;
      for (const p of this.players.values()) {
        // skip a frame for clients that can't keep up rather than buffering forever
        if (p.conn.backlog > 512 * 1024 && !full) continue;
        const snap = this.match.world.snapshot(this.match.heroFor(p.pid)?.id ?? -1, full);
        snap.ev = eventsFor(this.evBuf, this.match.heroFor(p.pid)?.id ?? -1);
        p.conn.send(JSON.stringify({ t: 's', d: snap }));
      }
      this.evBuf = [];
    }
    if (this.match.world.over && !this.overAt) this.overAt = Date.now();
  }

  dead() {
    if (!this.players.size && Date.now() - this.emptySince > 5000) return true;
    if (this.overAt && Date.now() - this.overAt > 120000) return true;
    if (this.state === 'lobby' && Date.now() - this.created > 2 * 3600 * 1000) return true;
    return false;
  }
}

export function onConnection(conn) {
  let window = Date.now();
  conn.on('message', (raw) => {
    // simple flood protection
    const now = Date.now();
    if (now - window > 1000) { window = now; conn.msgs = 0; }
    conn.msgs = (conn.msgs || 0) + 1;
    if (conn.msgs > 150) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') { conn.send(JSON.stringify({ t: 'pong', c: m.c })); return; }
    if (!conn.room) {
      let room = null;
      if (m.t === 'create' || m.t === 'quick') {
        if (m.t === 'quick') {
          for (const r of rooms.values()) if (r.public && r.state === 'lobby' && r.players.size < MAX_PLAYERS) { room = r; break; }
        }
        if (!room) {
          if (rooms.size >= MAX_ROOMS) { conn.send(JSON.stringify({ t: 'err', m: 'Server is full, try again soon' })); return; }
          room = new Room(m.t === 'quick');
          if (!room.code) return;
          rooms.set(room.code, room);
        }
      } else if (m.t === 'join') {
        room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) { conn.send(JSON.stringify({ t: 'err', m: 'Room not found' })); return; }
      } else return;
      const err = room.add(conn, m.name, m.hero);
      if (err) { conn.send(JSON.stringify({ t: 'err', m: err })); conn.room = null; }
      return;
    }
    const p = conn.room.players.get(conn.pid);
    if (!p) return;
    if (m.t === 'leave') { conn.room.remove(conn.pid); conn.room = null; return; }
    conn.room.handle(p, m);
  });
  conn.on('close', () => { if (conn.room) conn.room.remove(conn.pid); });
}

// Fixed-step loop for every room
let last = performance.now();
let acc = 0;
const STEP = DT * 1000;
function loop() {
  const now = performance.now();
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250; // don't spiral after a stall
  while (acc >= STEP) {
    acc -= STEP;
    for (const r of rooms.values()) {
      try { r.tick(); } catch (e) { console.error('room tick failed', r.code, e); r.state = 'lobby'; }
    }
  }
  for (const [code, r] of rooms) if (r.dead()) rooms.delete(code);
  setTimeout(loop, 4);
}
loop();

export function stats() {
  let players = 0;
  for (const r of rooms.values()) players += r.players.size;
  return { rooms: rooms.size, players };
}
