// Two real browsers: host creates a room, guest joins by code, host starts, both play.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const fs = await import('node:fs');
const url = process.env.URL || 'http://localhost:8787/';
const out = process.env.OUT || 'tests/e2e/out';
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function open(name) {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 620 } })).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) errors.push(`${name}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.click('[data-a=online]');
  await page.fill('.online-screen .name', name);
  return page;
}
const host = await open('Host');
await host.click('.create');
await host.waitForSelector('.lobby-screen .code');
const code = (await host.textContent('.lobby-screen .code')).trim();
console.log('room code', code);
const guest = await open('Guest');
await guest.fill('.code', code);
await guest.click('.joinb');
await guest.waitForSelector('.lobby-screen');
await host.waitForTimeout(500);
// guest picks Lyra, host picks Vex and sets 3v3
await guest.click('.champ:nth-child(2)');
await host.click('.champ:nth-child(3)');
await host.click('.size button[data-v="3"]');
await host.waitForTimeout(600);
await host.screenshot({ path: `${out}/mp-lobby.png` });
const lobbyNames = await host.$$eval('.tm li', (els) => els.map((e) => e.textContent.trim()));
console.log('lobby:', lobbyNames);
await host.click('.start');
await host.waitForSelector('.hud .panel', { timeout: 10000 });
await guest.waitForSelector('.hud .panel', { timeout: 10000 });
await host.waitForTimeout(6000);
const state = async (p) => p.evaluate(() => { const g = window.__spirebreak.game; return { t: g.latestT, hero: g.me.def.id, team: g.myTeam, heroes: g.heroes.size, snaps: g.snaps.length, ping: Math.round(g.transport.ping), names: [...g.heroes.values()].map((h) => h.name + (h.bot ? '(bot)' : '')) }; });
console.log('host', JSON.stringify(await state(host)));
console.log('guest', JSON.stringify(await state(guest)));
// guest walks forward for 3 s; host should see the guest's hero move
const before = await host.evaluate(() => { const g = window.__spirebreak.game; const v = [...g.heroes.values()].find((h) => h.name === 'Guest'); return [v.x, v.z]; });
await guest.keyboard.down('KeyW');
await guest.waitForTimeout(3000);
await guest.keyboard.up('KeyW');
await host.waitForTimeout(800);
const after = await host.evaluate(() => { const g = window.__spirebreak.game; const v = [...g.heroes.values()].find((h) => h.name === 'Guest'); return [v.x, v.z]; });
console.log('guest moved on host screen by', Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(2));
await host.screenshot({ path: `${out}/mp-host.png` });
await guest.screenshot({ path: `${out}/mp-guest.png` });
// guest leaves -> their champion becomes a bot on the host
await guest.close();
await host.waitForTimeout(2000);
const t2 = await host.evaluate(() => window.__spirebreak.game.latestT);
console.log('host still running, t =', t2);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
