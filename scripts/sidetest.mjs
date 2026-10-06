// Side-fairness probe: identical random comps on both teams, in both slot orders.
import { World } from '../src/shared/sim/world.js';
import { HEROES } from '../src/shared/heroes.js';
import { rng } from '../src/shared/math.js';
const N = +(process.argv[2] || 8);
const res = { normal: [0, 0], reversed: [0, 0] };
for (const order of ['normal', 'reversed']) {
  for (let m = 0; m < N; m++) {
    const r = rng(9000 + m);
    const comp = HEROES.map((h) => h.id).sort(() => r() - 0.5).slice(0, 5);
    const A = comp.map((id) => ({ heroId: id, team: 0, bot: true })), B = comp.map((id) => ({ heroId: id, team: 1, bot: true }));
    const w = new World({ slots: order === 'normal' ? [...A, ...B] : [...B, ...A], seed: 300 + m });
    while (!w.over && w.t < 40 * 60) { w.step(); w.drainEvents(); }
    if (w.winner >= 0) res[order][w.winner]++;
  }
}
console.log(JSON.stringify(res), '(normal: blue listed first; reversed: red listed first)');
