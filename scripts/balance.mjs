// Balance probe: many bot-vs-bot matches with shuffled teams; prints per-champion stats.
import { World } from '../src/shared/sim/world.js';
import { HEROES } from '../src/shared/heroes.js';
import { rng } from '../src/shared/math.js';
const N = +(process.argv[2] || 12);
const stat = Object.fromEntries(HEROES.map((h) => [h.id, { g: 0, w: 0, k: 0, d: 0, a: 0, dmg: 0, gold: 0 }]));
const lengths = [];
const sideWins = [0, 0];
for (let m = 0; m < N; m++) {
  const r = rng(1000 + m);
  const ids = HEROES.map((h) => h.id).sort(() => r() - 0.5);
  const slots = ids.map((id, i) => ({ heroId: id, team: i < 5 ? 0 : 1, bot: true, name: id }));
  const w = new World({ slots, seed: 77 + m });
  while (!w.over && w.t < 45 * 60) { w.step(); w.drainEvents(); }
  lengths.push(w.t / 60);
  if (w.winner >= 0) sideWins[w.winner]++;
  for (const h of w.heroes) {
    const s = stat[h.heroId];
    s.g++; s.w += h.team === w.winner ? 1 : 0; s.k += h.k; s.d += h.d; s.a += h.a; s.dmg += h.dmgDealt; s.gold += h.totalGold;
  }
}
console.log('match minutes', lengths.map((x) => x.toFixed(1)).join(' '), ' side wins', sideWins);
console.log('hero      win%   K     D     A    dmg/game  gold/game');
for (const [id, s] of Object.entries(stat).sort((a, b) => b[1].w / b[1].g - a[1].w / a[1].g)) {
  console.log(id.padEnd(9), ((s.w / s.g) * 100).toFixed(0).padStart(4), (s.k / s.g).toFixed(1).padStart(5), (s.d / s.g).toFixed(1).padStart(5), (s.a / s.g).toFixed(1).padStart(5), Math.round(s.dmg / s.g).toString().padStart(9), Math.round(s.gold / s.g).toString().padStart(9));
}
