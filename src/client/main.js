// Spirebreak bootstrap: renderer, menus, match lifecycle and the main loop.
import { Renderer } from './engine/renderer.js';
import { mat4 } from './engine/mat.js';
import { buildWorld, heightAt } from './render/terrain.js';
import { buildHeroModel, animateHero } from './render/heroModels.js';
import { buildUnitModel, animateUnit } from './render/unitModels.js';
import { VFX } from './render/vfx.js';
import { Input, isTouch } from './input.js';
import { Audio } from './audio.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { ClientGame } from './game.js';
import { LocalTransport } from './net.js';
import { TOWERS, SPIRE_POS } from '../shared/map.js';
import { HERO_BY_ID } from '../shared/heroes.js';
import { K } from '../shared/constants.js';

const DEFAULTS = {
  quality: null, sensitivity: 1, fov: 62, volume: 0.8, music: 0.45, sfx: 0.9, invertY: false, shake: true, autoCam: true, name: 'Player', lastHero: 'kaelen',
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('spirebreak.settings') || '{}') || {}; } catch { s = {}; }
  const out = { ...DEFAULTS, ...s };
  if (!out.quality) {
    const cores = navigator.hardwareConcurrency || 4;
    out.quality = isTouch() ? (cores >= 6 ? 'medium' : 'low') : 'high';
  }
  return out;
}

const ROOT = mat4.create();

class MenuScene {
  constructor(app) {
    this.app = app;
    this.mode = 'title';
    this.t = 0;
    this.structs = [...TOWERS.map((t) => ({ kind: K.TOWER, team: t.team, x: t.pos[0], z: t.pos[1] })), ...[0, 1].map((team) => ({ kind: K.SPIRE, team, x: SPIRE_POS[team][0], z: SPIRE_POS[team][1] }))];
    for (const s of this.structs) s.model = buildUnitModel(s.kind, s.team, 0);
    this.hero = null;
    this.heroId = null;
    this.spot = [-58, 100];
    this.vfx = new VFX(app.renderer, { getPos: () => null, shake: () => {} });
    this.flourish = 0;
    this.galleryMode = new URLSearchParams(location.search).has('gallery');
  }
  showcase(id) {
    if (this.heroId === id) return;
    this.heroId = id;
    this.hero = buildHeroModel(HERO_BY_ID[id]);
    this.flourish = this.t;
    const [x, z] = this.spot;
    this.vfx.respawn({ x, y: heightAt(x, z), z }, 0);
  }
  // ?gallery — line up every champion (handy for reviewing art)
  gallery(R, t) {
    if (!this.all) this.all = Object.values(HERO_BY_ID).map((d) => buildHeroModel(d));
    const [x0, z0] = [-60, 100];
    R.setCamera([x0, heightAt(x0, z0) + 3.2, z0 + 15], [x0, heightAt(x0, z0) + 1.4, z0], 50);
    this.all.forEach((m, i) => {
      const x = x0 + (i - 4.5) * 2.7, z = z0;
      const gy = heightAt(x, z);
      animateHero(m, { t: t + i, speed: 0, phase: 0, atk: -1, atkN: 0, cast: -1, slot: 'q', dash: false, stun: false, dead: -1, recall: false, channel: false });
      mat4.compose(ROOT, x, gy, z, 0, 0.25, 0, m.scale, m.scale, m.scale);
      m.rig.draw(R, ROOT, {});
    });
  }
  frame(dt) {
    const R = this.app.renderer;
    this.t += dt;
    const t = this.t;
    if (this.galleryMode) { this.gallery(R, t); R.render(); return; }
    if (this.mode === 'select' && this.hero) {
      const [x, z] = this.spot;
      const gy = heightAt(x, z);
      // frame the champion in the right third of the screen
      const a = Math.sin(t * 0.25) * 0.25;
      const ex = x + Math.sin(a) * 10, ez = z + Math.cos(a) * 10;
      const rx = -Math.cos(a), rz = Math.sin(a); // camera-right when looking toward the hero
      const narrow = innerWidth < innerHeight * 1.2;
      const off = narrow ? 0 : 3.6;
      R.setCamera([ex + rx * off, gy + 2.3, ez + rz * off], [x + rx * off, gy + 1.45, z + rz * off], 50);
      const ft = t - this.flourish;
      const cast = ft < 0.9 ? ft / 0.9 : -1;
      animateHero(this.hero, { t, speed: 0, phase: 0, atk: -1, atkN: 0, cast, slot: 'r', dash: false, stun: false, dead: -1, recall: false, channel: false });
      const s = this.hero.scale * 1.15;
      mat4.compose(ROOT, x, gy, z, 0, 0.35 + Math.sin(t * 0.4) * 0.15, 0, s, s, s);
      this.hero.rig.draw(R, ROOT, { emissiveBoost: Math.sin(t * 4) * 0.3 });
      R.decal(5, x, gy + 0.08, z, t * 0.5, 3, 3, [1, 0.85, 0.4], 0.9);
      R.sprite(x, gy + 0.05, z, 1.8, 0, 0, 0, 0.45, 5, 0, 0, 1);
      if (Math.random() < 0.4) this.vfx.spawn({ x: x + (Math.random() - 0.5) * 3, y: gy + 0.2, z: z + (Math.random() - 0.5) * 3, vy: 1.5, life: 1.2, size: 0.25, c: [1, 0.85, 0.5], shape: 2 });
    } else {
      const a = t * 0.045 + 2.2;
      const rad = 92;
      R.setCamera([Math.cos(a) * rad, 46, Math.sin(a) * rad], [0, 0, 0], 55);
    }
    for (const s of this.structs) {
      animateUnit(s.model, { t: t + s.x, speed: 0, phase: 0, atk: -1, dead: -1 });
      mat4.compose(ROOT, s.x, heightAt(s.x, s.z), s.z, 0, 0, 0, 1, 1, 1);
      s.model.rig.draw(R, ROOT, {});
    }
    this.vfx.update(dt);
    this.vfx.draw();
    R.tintAmt = 0;
    R.render();
  }
}

class App {
  constructor() {
    this.settings = loadSettings();
    this.canvas = document.getElementById('gl');
    try {
      this.renderer = new Renderer(this.canvas, this.settings.quality);
    } catch (e) {
      document.getElementById('menu').innerHTML = `<div class="screen fatal"><h1>SPIREBREAK</h1><p>${e.message}</p><p>Please use a recent Chrome, Safari, Firefox or Edge.</p></div>`;
      throw e;
    }
    buildWorld(this.renderer);
    this.audio = new Audio(this.settings);
    this.input = new Input(this.canvas, this.settings);
    this.hud = new HUD(this);
    this.menus = new Menus(this);
    this.scene = new MenuScene(this);
    this.game = null;
    this.fps = 60;
    this.frameMs = 16;
    this.slowT = 0;
    this.fastT = 0;
    this.last = performance.now();
    document.body.classList.toggle('touch', this.input.touch);
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 300));
    const unlock = () => { this.audio.unlock(); if (!this.audio.musicOn) this.audio.startMusic(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.menus.title();
    if (new URLSearchParams(location.search).get('room')) this.menus.onlineEntry();
    requestAnimationFrame((t) => this.loop(t));
    window.__spirebreak = this;
  }

  saveSettings() {
    try { localStorage.setItem('spirebreak.settings', JSON.stringify(this.settings)); } catch { /* storage unavailable */ }
  }

  applyQuality() {
    this.renderer.setQuality(this.settings.quality);
    this.renderer.scale = 1;
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frameMs = this.frameMs * 0.92 + dt * 1000 * 0.08;
    this.fps = 1000 / Math.max(1, this.frameMs);
    this.adaptResolution(dt);
    this.renderer.time += dt;
    this.renderer.resize();
    try {
      if (this.game) this.game.frame(dt);
      else this.scene.frame(dt);
    } catch (e) {
      console.error(e);
      if (!this.errShown) { this.errShown = true; try { if (this.game) this.hud.toast('Error: ' + e.message, 'bad'); } catch { /* HUD not ready */ } }
    }
  }

  // dynamic resolution keeps mobile at a playable frame rate
  adaptResolution(dt) {
    const R = this.renderer;
    if (this.frameMs > 26) { this.slowT += dt; this.fastT = 0; } else if (this.frameMs < 15) { this.fastT += dt; this.slowT = 0; } else { this.slowT = 0; this.fastT = 0; }
    if (this.slowT > 2 && R.scale > 0.55) { R.scale = Math.max(0.55, R.scale - 0.1); this.slowT = 0; }
    if (this.fastT > 5 && R.scale < 1) { R.scale = Math.min(1, R.scale + 0.1); this.fastT = 0; }
  }

  enterGameUI() {
    this.menus.hide();
    this.input.enabled = true;
    if (this.input.touch) {
      try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* */ }
      try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* */ }
    }
  }

  startLocal(opts) {
    this.lastLocal = opts;
    const t = new LocalTransport(opts);
    let start = null;
    t.on((m) => { if (m.t === 'start') start = m; });
    t.start();
    this.enterGameUI();
    this.game = new ClientGame(this, t, start);
  }

  startOnline(net, start) {
    this.lastLocal = null;
    this.enterGameUI();
    this.game = new ClientGame(this, net, start);
  }

  leaveMatch() {
    if (this.game) { this.game.destroy(); this.game = null; }
    this.input.enabled = false;
    this.input.exitLock();
    this.input.attack = false;
    this.renderer.tintAmt = 0;
    this.menus.title();
  }

  playAgain() {
    const opts = this.lastLocal;
    this.leaveMatch();
    if (opts) this.startLocal(opts);
    else this.menus.onlineEntry();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
