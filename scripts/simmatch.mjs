import { World } from '../src/shared/sim/world.js';
import { HEROES } from '../src/shared/heroes.js';
import { DT } from '../src/shared/constants.js';
const diff = process.argv[2] || 'normal';
const seed = +(process.argv[3] || 7);
const slots = HEROES.map((h, i) => ({ heroId: h.id, team: i % 2, bot: true, name: h.name, difficulty: diff }));
const w = new World({ slots, seed });
const t0 = Date.now();
let evCount = 0, maxEv = 0;
const counts = {};
while (!w.over && w.t < 40 * 60) {
  w.step();
  const ev = w.drainEvents();
  evCount += ev.length; maxEv = Math.max(maxEv, ev.length);
  for (const e of ev) counts[e.e] = (counts[e.e] || 0) + 1;
  if (w.tick % (60 * 30) === 0) {
    const tw = w.structs.filter(s => s.dead).length;
    console.log(`t=${(w.t/60).toFixed(1)}m kills ${w.kills} units ${w.units.length} projs ${w.projs.length} towersDown ${tw} lv ${w.heroes.map(h=>h.level).join(',')}`);
  }
}
console.log('over', w.over, 'winner', w.winner, 'time', (w.t/60).toFixed(2), 'min; wall ms', Date.now() - t0);
console.log('events/tick avg', (evCount / w.tick).toFixed(1), 'max', maxEv);
console.log(counts);
for (const h of w.heroes) console.log(h.team, h.heroId.padEnd(8), `${h.k}/${h.d}/${h.a}`, 'cs', h.cs, 'lv', h.level, 'gold', Math.round(h.totalGold), h.items.join(','));
const snap = w.snapshot(w.heroes[0].id, true);
console.log('snapshot bytes', JSON.stringify(snap).length);
