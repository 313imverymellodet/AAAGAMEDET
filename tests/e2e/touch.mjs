// Mobile touch controls: joystick drag, attack hold, tap-cast and drag-aim abilities.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const out = process.env.OUT || 'tests/e2e/out';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto(process.env.URL || 'http://localhost:8787/');
await page.waitForTimeout(1500);
await page.tap('[data-a=ai]');
await page.waitForTimeout(400);
await page.tap('.champ:nth-child(9)'); // Ignis
await page.tap('.start');
await page.waitForTimeout(1500);
const touch = async (sel, type, x, y, id = 1) => page.evaluate(({ sel, type, x, y, id }) => {
  const el = sel ? document.querySelector(sel) : document.getElementById('gl');
  const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
}, { sel, type, x, y, id });
const pos = () => page.evaluate(() => { const g = window.__spirebreak.game; return [g.me.x, g.me.z, g.cam.yaw]; });
const p0 = await pos();
// joystick: press on left, drag up (forward) for 2 s
await touch(null, 'touchstart', 150, 280, 7);
await touch(null, 'touchmove', 150, 220, 7);
await page.waitForTimeout(2000);
await touch(null, 'touchend', 150, 220, 7);
const p1 = await pos();
console.log('moved with joystick', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2));
// camera look: drag on the right side
await touch(null, 'touchstart', 600, 150, 8);
await touch(null, 'touchmove', 680, 150, 8);
await touch(null, 'touchend', 680, 150, 8);
await page.waitForTimeout(300);
const p2 = await pos();
console.log('camera yaw changed', (p2[2] - p1[2]).toFixed(2));
// tap-cast Q
const box = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
let [qx, qy] = await box('.ab-q');
await touch('.ab-q', 'touchstart', qx, qy, 3);
await touch('.ab-q', 'touchend', qx, qy, 3);
await page.waitForTimeout(600);
// drag-aim E
const [ex, ey] = await box('.ab-e');
await touch('.ab-e', 'touchstart', ex, ey, 4);
await touch('.ab-e', 'touchmove', ex - 60, ey - 70, 4);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/m-aim.png` });
await touch('.ab-e', 'touchend', ex - 60, ey - 70, 4);
await page.waitForTimeout(500);
// hold attack
const [ax, ay] = await box('.ab-atk');
await touch('.ab-atk', 'touchstart', ax, ay, 5);
await page.waitForTimeout(1200);
await touch('.ab-atk', 'touchend', ax, ay, 5);
const cds = await page.evaluate(() => window.__spirebreak.game.meData.cd);
console.log('cooldowns after taps [q,e,r,dodge]', JSON.stringify(cds));
await page.screenshot({ path: `${out}/m-game1.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
