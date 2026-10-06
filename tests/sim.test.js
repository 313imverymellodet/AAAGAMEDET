// Headless simulation tests: run with `npm test` (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/shared/sim/world.js';
import { Match, sanitizeInput, buildSlots } from '../src/shared/match.js';
import { HEROES } from '../src/shared/heroes.js';
import { ITEMS } from '../src/shared/items.js';
import { OBSTACLES, TOWERS, LANES, resolveStatic } from '../src/shared/map.js';
import { K, F } from '../src/shared/constants.js';

const allBots = (diff = 'normal') => HEROES.map((h, i) => ({ heroId: h.id, team: i % 2, bot: true, name: h.name, difficulty: diff }));

test('ten unique champions with complete kits', () => {
  assert.equal(HEROES.length, 10);
  assert.equal(new Set(HEROES.map((h) => h.id)).size, 10);
  for (const h of HEROES) {
    for (const s of ['q', 'e', 'r']) {
      assert.ok(h[s].name && h[s].desc && h[s].cd > 0, `${h.id}.${s}`);
      assert.ok(['dir', 'point', 'self', 'unit'].includes(h[s].aim), `${h.id}.${s} aim`);
    }
    for (const it of h.build) assert.ok(ITEMS.find((i) => i.id === it), `${h.id} build item ${it}`);
  }
});

test('map is symmetric and lanes are unobstructed', () => {
  assert.equal(TOWERS.length, 14);
  // every tower must sit next to the lane it is labelled with
  for (const t of TOWERS) {
    if (t.lane === 'base') continue;
    const path = LANES[t.lane];
    let best = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      for (let k = 0; k <= 50; k++) {
        const x = path[i][0] + (path[i + 1][0] - path[i][0]) * (k / 50), z = path[i][1] + (path[i + 1][1] - path[i][1]) * (k / 50);
        best = Math.min(best, Math.hypot(x - t.pos[0], z - t.pos[1]));
      }
    }
    assert.ok(best < 7, `team ${t.team} ${t.lane} tower at ${t.pos} is ${best.toFixed(1)} from its lane`);
  }
  assert.equal(OBSTACLES.length % 4, 0);
  for (const path of Object.values(LANES)) {
    for (let i = 0; i < path.length - 1; i++) {
      for (let k = 0; k <= 20; k++) {
        const x = path[i][0] + (path[i + 1][0] - path[i][0]) * (k / 20);
        const z = path[i][1] + (path[i + 1][1] - path[i][1]) * (k / 20);
        const [rx, rz] = resolveStatic(x, z, 0.8);
        assert.ok(Math.hypot(rx - x, rz - z) < 0.01, `lane point ${x},${z} is blocked`);
      }
    }
  }
});

for (const diff of ['easy', 'normal', 'hard']) {
  test(`bot match (${diff}) finishes with a winner and no errors`, () => {
    const w = new World({ slots: allBots(diff), seed: 11 });
    while (!w.over && w.t < 45 * 60) { w.step(); w.drainEvents(); }
    assert.ok(w.over, `match did not end by ${(w.t / 60).toFixed(1)} min`);
    assert.ok(w.winner === 0 || w.winner === 1);
    assert.ok(w.t > 6 * 60, 'match ended suspiciously fast');
    for (const h of w.heroes) {
      assert.ok(Number.isFinite(h.x) && Number.isFinite(h.z), `${h.heroId} position is finite`);
      assert.ok(h.level >= 4, `${h.heroId} leveled up`);
      assert.ok(h.items.length >= 1, `${h.heroId} bought items`);
    }
  });
}

test('every ability of every champion can be cast without errors', () => {
  for (const hero of HEROES) {
    const slots = [{ heroId: hero.id, team: 0, bot: false, playerId: 'p' }, { heroId: HEROES[(HEROES.indexOf(hero) + 1) % 10].id, team: 1, bot: false, playerId: 'e' }];
    const w = new World({ slots, seed: 3 });
    const [me, foe] = w.heroes;
    me.x = 0; me.z = 0; foe.x = 4; foe.z = 0;
    me.level = 6; w.recalc(me);
    for (let i = 0; i < 60; i++) w.step();
    w.drainEvents();
    let hits = 0, casts = 0;
    for (const s of ['q', 'e', 'r']) {
      me.cds[s] = 0;
      foe.x = 4; foe.z = 0; foe.hp = foe.maxHp; foe.dead = false;
      me.input = { mx: 0, mz: 0, ax: foe.x, az: foe.z, atk: false, casts: [s], seq: 1 };
      w.step();
      for (let i = 0; i < 90; i++) { me.input.casts = []; w.step(); }
      assert.ok(me.cds[s] > 0, `${hero.id} ${s} went on cooldown`);
      for (const ev of w.drainEvents()) {
        if (ev.e === 'dmg' && ev.i === foe.id && ev.s === me.id) hits++;
        if (ev.e === 'cast' && ev.i === me.id) casts++;
      }
    }
    assert.equal(casts, 3, `${hero.id} cast all three abilities`);
    assert.ok(hits > 0, `${hero.id} abilities damaged the target`);
  }
});

test('structures fall in order (outer protects inner, guardian protects spire)', () => {
  const w = new World({ slots: allBots(), seed: 5 });
  const inner = w.structs.find((s) => s.team === 1 && s.tier === 2 && s.lane === 'mid');
  const spire = w.structs.find((s) => s.team === 1 && s.kind === K.SPIRE);
  assert.ok(w.structProtected(inner));
  assert.ok(w.structProtected(spire));
  assert.equal(w.damage(w.heroes[0], inner, 500, 'true'), 0);
  const outer = w.structs.find((s) => s.team === 1 && s.tier === 1 && s.lane === 'mid');
  w.damage(w.heroes[0], outer, 99999, 'true');
  assert.ok(outer.dead);
  assert.ok(!w.structProtected(inner));
  assert.ok(w.flagsOf(spire) & F.INVULN);
});

test('match input sanitizing rejects junk', () => {
  const i = sanitizeInput({ s: 'x', mx: 99, mz: NaN, ax: Infinity, az: -1e9, a: 'yes', c: ['q', 'hack', 'r', 'r', 'r', 'r'] });
  assert.equal(i.mx, 1);
  assert.equal(i.mz, 0);
  assert.equal(i.ax, 0);
  assert.equal(i.az, -400);
  assert.equal(i.a, 1);
  assert.deepEqual(i.c, ['q', 'r', 'r', 'r']);
});

test('slots are filled with bots without duplicate champions per team', () => {
  for (const size of [1, 3, 5]) {
    const slots = buildSlots([{ pid: 1, name: 'A', hero: 'vex', team: 0 }, { pid: 2, name: 'B', hero: 'vex', team: 1 }], size, 'normal');
    for (const team of [0, 1]) {
      const t = slots.filter((s) => s.team === team);
      assert.equal(t.length, size);
      assert.equal(new Set(t.map((s) => s.heroId)).size, size);
    }
  }
});

test('human input drives movement and snapshots stay compact', () => {
  const m = new Match({ humans: [{ pid: 'me', name: 'Me', hero: 'sylva', team: 0 }], teamSize: 5 });
  const me = m.heroFor('me');
  const x0 = me.x;
  for (let s = 1; s <= 30; s++) { m.pushInput('me', { s, mx: 1, mz: -1, ax: 0, az: 0 }); m.tick(); }
  assert.ok(me.x > x0 + 3, 'hero moved');
  assert.equal(me.input.seq, 30);
  for (let i = 0; i < 30 * 120; i++) m.tick();
  const snap = m.snapshotFor('me', m.lastEvents, true);
  const bytes = JSON.stringify(snap).length;
  assert.ok(bytes < 12000, `snapshot is ${bytes} bytes`);
  assert.ok(snap.me && snap.me.cd.length === 4);
});

test('shop only works at base and respects gold', () => {
  const m = new Match({ humans: [{ pid: 'me', name: 'Me', hero: 'kaelen', team: 0 }], teamSize: 1 });
  const me = m.heroFor('me');
  assert.ok(m.buy('me', 'boots'));
  assert.ok(!m.buy('me', 'boots'), 'unique item');
  assert.ok(!m.buy('me', 'titan'), 'not enough gold');
  me.gold = 5000;
  me.x = 0; me.z = 0;
  assert.ok(!m.buy('me', 'titan'), 'must be in base');
});
