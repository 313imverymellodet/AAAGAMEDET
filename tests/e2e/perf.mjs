// Measures CPU cost of a client frame (simulation + scene building), excluding GPU work.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL || 'http://localhost:8787/');
await page.waitForTimeout(1500);
await page.click('[data-a=ai]');
await page.waitForTimeout(400);
await page.click('.start');
await page.waitForTimeout(1000);
const res = await page.evaluate(() => {
  const app = window.__spirebreak;
  const g = app.game;
  const m = g.transport.match;
  for (let i = 0; i < 30 * 200; i++) m.tick(); // jump to ~3:20 with full waves on the map
  const me = m.world.heroes.find((h) => h.id === g.myId);
  me.x = 0; me.z = 0;
  const R = app.renderer;
  const realRender = R.render.bind(R);
  // warm up
  for (let i = 0; i < 30; i++) g.frame(1 / 60);
  R.render = () => { for (const geom of Object.values(R.geoms)) { geom.lists.o.n = geom.lists.p.n = geom.lists.t.n = 0; } R.spriteN = 0; R.decals.length = 0; };
  let t0 = performance.now();
  const N = 120;
  for (let i = 0; i < N; i++) g.frame(1 / 60);
  const cpu = (performance.now() - t0) / N;
  R.render = realRender;
  let sim = performance.now();
  for (let i = 0; i < 300; i++) m.tick();
  sim = (performance.now() - sim) / 300;
  let inst = 0;
  for (const geom of Object.values(R.geoms)) inst += geom.lists.so.n + geom.lists.sp.n;
  return { cpuMsPerFrame: cpu.toFixed(2), simMsPerTick: sim.toFixed(3), units: g.units.size, staticInstances: inst, t: m.world.t.toFixed(0) };
});
console.log(JSON.stringify(res), errors);
await browser.close();
