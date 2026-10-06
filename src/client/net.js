// Transports: LocalTransport runs the authoritative Match in the browser (offline vs bots);
// NetTransport talks to the Node room server over WebSocket. Both speak the same messages.
import { Match } from '../shared/match.js';
import { DT, SNAPSHOT_EVERY } from '../shared/constants.js';

function startMessage(match, pid) {
  const w = match.world;
  const me = match.heroFor(pid);
  return {
    t: 'start', you: me ? me.id : -1, seed: match.seed,
    roster: w.roster(),
    structs: w.structs.map((s) => ({ id: s.id, kind: s.kind, team: s.team, x: s.x, z: s.z, maxHp: s.maxHp, tier: s.tier, lane: s.lane, radius: s.radius })),
  };
}
export { startMessage };

export class LocalTransport {
  constructor({ hero, team, teamSize, difficulty, name }) {
    this.local = true;
    this.match = new Match({ humans: [{ pid: 'me', name, hero, team }], teamSize, difficulty });
    this.handlers = [];
    this.acc = 0;
    this.paused = false;
    this.first = true;
    this.ping = 0;
  }
  on(cb) { this.handlers.push(cb); }
  emit(m) { for (const h of this.handlers) h(m); }
  start() { this.emit(startMessage(this.match, 'me')); }
  send(m) {
    switch (m.t) {
      case 'in': this.match.pushInput('me', m); break;
      case 'buy': this.match.buy('me', m.it); break;
      case 'sell': this.match.sell('me', m.i); break;
    }
  }
  update(dt) {
    if (this.paused) return;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= DT && n < 6) {
      this.acc -= DT;
      n++;
      const ev = this.match.tick();
      const snap = this.match.snapshotFor('me', ev, this.first);
      this.first = false;
      this.emit({ t: 's', d: snap });
      if (this.match.world.over && !this.ended) { this.ended = true; }
    }
  }
  close() { this.handlers = []; }
}

export function serverURL() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export class NetTransport {
  constructor(url = serverURL()) {
    this.local = false;
    this.handlers = [];
    this.url = url;
    this.ping = 0;
    this.open = false;
    this.ws = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      try { this.ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Connection timed out')); try { this.ws.close(); } catch { /* */ } } }, 6000);
      this.ws.onopen = () => {
        this.open = true;
        if (!settled) { settled = true; clearTimeout(timer); resolve(this); }
        this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
      };
      this.ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Could not reach the game server')); } };
      this.ws.onclose = () => {
        this.open = false;
        clearInterval(this.pingTimer);
        for (const h of this.handlers) h({ t: 'closed' });
      };
      this.ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'pong') { this.ping = performance.now() - m.c; return; }
        for (const h of this.handlers) h(m);
      };
    });
  }
  on(cb) { this.handlers.push(cb); }
  off(cb) { this.handlers = this.handlers.filter((h) => h !== cb); }
  send(m) { if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  update() {}
  close() { clearInterval(this.pingTimer); this.handlers = []; try { this.ws && this.ws.close(); } catch { /* */ } }
}

export { SNAPSHOT_EVERY };
