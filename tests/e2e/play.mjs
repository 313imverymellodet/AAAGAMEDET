// Scripted play-through: walk to mid lane, fight, use abilities, screenshot along the way.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const fs = await import('node:fs');
const url = process.env.URL || 'http://localhost:8787/';
const out = process.env.OUT || 'tests/e2e/out';
fs.mkdirSync(out, { recursive: true });
const hero = process.env.HERO || '1';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('fonts.g') && !m.text().includes('TUNNEL')) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.click('[data-a=ai]');
await page.waitForTimeout(500);
await page.click(`.champ:nth-child(${hero})`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/select.png` });
await page.click('.start');
await page.waitForTimeout(1500);
// speed the offline sim up so we reach the laning phase quickly in slow software rendering
await page.evaluate(() => {
  const g = window.__spirebreak.game;
  const w = g.transport.match.world;
  window.__ff = (sec) => { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) { g.transport.match.tick(); } };
  w.heroes.find((h) => h.id === g.myId).gold += 3000;
});
await page.keyboard.down('KeyP');
await page.keyboard.up('KeyP');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/shop.png` });
await page.click('.shop .quick');
await page.waitForTimeout(400);
await page.click('.shop .quick');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// teleport our hero toward mid lane and fast-forward until waves meet
await page.evaluate(() => {
  const g = window.__spirebreak.game;
  const w = g.transport.match.world;
  const me = w.heroes.find((h) => h.id === g.myId);
  me.x = -32; me.z = 36;
  window.__ff(26);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/lane0.png` });
// fight: hold attack, cast abilities
await page.mouse.move(640, 300);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.keyboard.down('KeyQ'); await page.waitForTimeout(300); await page.keyboard.up('KeyQ');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/lane1.png` });
await page.keyboard.down('KeyE'); await page.waitForTimeout(250); await page.keyboard.up('KeyE');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/lane2.png` });
await page.mouse.up();
await page.evaluate(() => { const g = window.__spirebreak.game; const w = g.transport.match.world; const me = w.heroes.find((h) => h.id === g.myId); me.xp = 2000; w.giveXp(me, 1); });
await page.waitForTimeout(500);
await page.keyboard.down('KeyR'); await page.waitForTimeout(300); await page.keyboard.up('KeyR');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/lane3.png` });
await page.keyboard.down('Tab');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/score.png` });
await page.keyboard.up('Tab');
// jump to late game and check the match still runs
await page.evaluate(() => window.__ff(420));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/late.png` });
const info = await page.evaluate(() => { const g = window.__spirebreak.game; return { t: g.latestT, units: g.units.size, kills: g.kills, me: g.meData && { lv: g.meData.lv, g: g.meData.g, it: g.meData.it }, fps: window.__spirebreak.fps }; });
console.log('info', JSON.stringify(info));
console.log('errors:', errors.length ? '\n' + errors.slice(0, 30).join('\n') : 'none');
await browser.close();
