// Debug helper: open the game, optionally start an offline match, take screenshots.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const url = process.env.URL || 'http://localhost:8787/';
const out = process.env.OUT || 'tests/e2e/out';
const mobile = !!process.env.MOBILE;
const fs = await import('node:fs');
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/${mobile ? 'm-' : ''}title.png` });
if (process.env.PLAY) {
  await page.click('[data-a=ai]');
  await page.waitForTimeout(1200);
  if (process.env.HERO) await page.click(`.champ:nth-child(${process.env.HERO})`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${mobile ? 'm-' : ''}select.png` });
  await page.click('.start');
  const waits = (process.env.WAITS || '3000,12000').split(',').map(Number);
  let i = 0;
  for (const w of waits) {
    await page.waitForTimeout(w);
    await page.screenshot({ path: `${out}/${mobile ? 'm-' : ''}game${i++}.png` });
  }
  const info = await page.evaluate(() => { const g = window.__spirebreak.game; return g ? { t: g.latestT, me: [g.me.x, g.me.z], units: g.units.size, fps: window.__spirebreak.fps, scale: window.__spirebreak.renderer.scale } : null; });
  console.log('info', JSON.stringify(info));
}
console.log('errors:', errors.length ? '\n' + errors.slice(0, 20).join('\n') : 'none');
await browser.close();
