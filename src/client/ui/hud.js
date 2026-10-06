// In-match HUD (DOM): ability bar, minimap, overhead bars, shop, scoreboard, kill feed,
// announcements, death/end screens and the mobile touch layout.
import { F, K, ULT_LEVEL, TEAM_NAMES } from '../../shared/constants.js';
import { ITEMS, ITEM_BY_ID } from '../../shared/items.js';
import { LANES, SPIRE_POS, CAMPS, BOSSES } from '../../shared/map.js';
import { projectPoint } from '../engine/mat.js';
import { heightAt } from '../render/terrain.js';
import { ROLE_ICONS } from '../../shared/heroes.js';

export const GLYPHS = {
  kaelen: ['💥', '🛡️', '⚔️'], lyra: ['✨', '🌀', '🌠'], vex: ['🗡️', '👁️', '☠️'], brakka: ['🌪️', '⛰️', '😤'], sylva: ['➶', '🍃', '🎯'],
  mordrin: ['🦴', '🟢', '👻'], aurelia: ['☀️', '✚', '🔆'], zephyr: ['〰️', '💨', '🌪️'], ignis: ['🔥', '🧱', '🌋'], rime: ['❄️', '🧊', '💠'],
};

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class HUD {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('hud');
    this.game = null;
    this.hurtAmt = 0;
    this.shopOpen = false;
    this.menuOpen = false;
    this.scoreOpen = false;
    this.cache = {};
    this.barPool = new Map();
    this.mmAcc = 0;
    this.floatPool = [];
  }

  blocking() { return this.shopOpen || this.menuOpen; }

  // ---------------------------------------------------------------- build
  startMatch(game) {
    this.game = game;
    const app = this.app;
    const touch = app.input.touch;
    this.root.innerHTML = '';
    this.root.className = 'hud' + (touch ? ' touch' : ' desktop');
    this.root.style.display = 'block';
    const me = game.me;
    const def = me.def;
    // top center score
    this.score = h('div', 'score', `<span class="k blue">0</span><span class="clock">0:00</span><span class="k red">0</span>`);
    this.objectives = h('div', 'objectives');
    this.score.appendChild(this.objectives);
    this.root.appendChild(this.score);
    // minimap
    this.mm = h('canvas', 'minimap');
    this.mm.width = 360; this.mm.height = 360;
    this.root.appendChild(this.mm);
    this.mmBg = this.buildMinimapBg();
    // top right
    this.tr = h('div', 'topright', `<span class="kda">0 / 0 / 0</span><span class="cs">🗡 0</span><span class="net"></span>
      <button class="ib sb-btn" title="Scoreboard (Tab)">☰</button><button class="ib menu-btn" title="Menu (Esc)">⚙</button>`);
    this.root.appendChild(this.tr);
    this.tr.querySelector('.sb-btn').onclick = () => this.toggleScore();
    this.tr.querySelector('.menu-btn').onclick = () => this.toggleMenu();
    this.feed = h('div', 'killfeed');
    this.root.appendChild(this.feed);
    this.ann = h('div', 'announce');
    this.root.appendChild(this.ann);
    this.toastEl = h('div', 'toast');
    this.root.appendChild(this.toastEl);
    this.bars = h('div', 'bars');
    this.root.appendChild(this.bars);
    this.floats = h('div', 'floats');
    this.root.appendChild(this.floats);
    if (!touch) {
      this.cross = h('div', 'crosshair');
      this.root.appendChild(this.cross);
      this.lockHint = h('div', 'lockhint', 'Click to engage mouse-look · <b>WASD</b> move · <b>LMB</b> attack · <b>Q E R</b> abilities · <b>Space</b> dodge · <b>B</b> recall · <b>P</b> shop');
      this.root.appendChild(this.lockHint);
      app.input.onToggle.lock = (l) => this.lockHint.classList.toggle('hidden', l);
    }
    this.hurtEl = h('div', 'hurt');
    this.root.appendChild(this.hurtEl);

    // player panel
    const panel = h('div', 'panel');
    panel.innerHTML = `
      <div class="portrait" style="--c:${hexCss(def.palette.primary)};--c2:${hexCss(def.palette.accent)}"><span>${def.name[0]}</span><b class="lvl">1</b></div>
      <div class="vitals">
        <div class="pname">${def.name} <small>${def.title}</small></div>
        <div class="hpbar"><i class="sh"></i><i class="fill"></i><span class="txt"></span></div>
        <div class="xpbar"><i class="fill"></i></div>
        <div class="stats"></div>
      </div>
      <div class="items"></div>
      <div class="gold"><span class="g">500</span><button class="shopbtn">🛒 Shop</button></div>`;
    this.root.appendChild(panel);
    this.panel = panel;
    panel.querySelector('.shopbtn').onclick = () => this.toggleShop();
    // abilities
    const ab = h('div', 'abilities');
    const slots = [['q', 'Q'], ['e', 'E'], ['r', 'R'], ['d', touch ? '' : 'SPACE'], ['b', touch ? '' : 'B']];
    this.abEls = {};
    for (const [slot, key] of slots) {
      const spec = def[slot];
      const glyph = slot === 'd' ? '💨' : slot === 'b' ? '🏠' : GLYPHS[def.id][{ q: 0, e: 1, r: 2 }[slot]];
      const el = h('div', `ab ab-${slot}`, `<div class="ico">${glyph}</div><div class="cd"></div><span class="cdt"></span>${key ? `<kbd>${key}</kbd>` : ''}`);
      if (spec) el.title = `${spec.name} — ${spec.desc} (${spec.cd}s)`;
      else el.title = slot === 'd' ? 'Dodge roll — brief invulnerability' : 'Recall to base';
      el.style.setProperty('--c', hexCss(def.palette.accent));
      ab.appendChild(el);
      this.abEls[slot] = el;
    }
    if (touch) {
      const atk = h('div', 'ab ab-atk', '<div class="ico">⚔️</div>');
      ab.appendChild(atk);
      app.input.bindTouchButton(atk, 'atk');
      for (const s of ['q', 'e', 'r', 'd', 'b']) app.input.bindTouchButton(this.abEls[s], s);
      this.cancelZone = h('div', 'cancelzone', '✕<small>Cancel</small>');
      this.root.appendChild(this.cancelZone);
      app.input.onToggle.aimMove = (x, y) => this.cancelZone.classList.toggle('hot', this.inCancel(x, y));
      app.input.onToggle.aimEnd = () => this.cancelZone.classList.remove('hot', 'show');
      app.input.onToggle.inCancel = (x, y) => this.inCancel(x, y);
      this.joyEl = h('div', 'joy', '<i></i>');
      this.root.appendChild(this.joyEl);
    } else {
      for (const s of ['q', 'e', 'r', 'd', 'b']) {
        this.abEls[s].addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (s === 'd' || s === 'b') app.input.events.push({ type: 'press', slot: s });
          else app.input.events.push({ type: 'cast', slot: s, source: 'key' });
        });
      }
    }
    this.root.appendChild(ab);
    this.abilities = ab;
    // death overlay
    this.death = h('div', 'death hidden', '<div class="t">YOU WERE SLAIN</div><div class="r">Respawning in <b>0</b></div><div class="tip">Tip: you can shop while dead.</div>');
    this.root.appendChild(this.death);
    // modals
    this.shop = h('div', 'modal shop hidden');
    this.root.appendChild(this.shop);
    this.sb = h('div', 'modal scoreboard hidden');
    this.root.appendChild(this.sb);
    this.menu = h('div', 'modal pausemenu hidden');
    this.root.appendChild(this.menu);
    this.buildShop();
    app.input.onToggle.shop = () => this.toggleShop();
    app.input.onToggle.score = (v) => this.toggleScore(v);
    app.input.onToggle.menu = () => { if (this.shopOpen) this.toggleShop(false); else this.toggleMenu(); };
    this.cache = {};
  }

  endMatch() {
    this.root.innerHTML = '';
    this.root.style.display = 'none';
    this.barPool.clear();
    this.game = null;
  }

  inCancel(x, y) {
    if (!this.cancelZone) return false;
    const r = this.cancelZone.getBoundingClientRect();
    return x > r.left - 20 && x < r.right + 20 && y > r.top - 20 && y < r.bottom + 20;
  }

  // ---------------------------------------------------------------- per frame
  frame(game, dt) {
    const d = game.meData;
    const me = game.me;
    this.hurtAmt = Math.max(0, this.hurtAmt - dt * 1.5);
    this.hurtEl.style.opacity = this.hurtAmt.toFixed(2);
    this.updateBars(game);
    if (!d || !me) return;
    const c = this.cache;
    const set = (key, val, fn) => { if (c[key] !== val) { c[key] = val; fn(val); } };
    // score
    const clock = game.latestT;
    set('clock', Math.floor(clock), (v) => { this.score.querySelector('.clock').textContent = fmtTime(v); });
    set('kb', game.kills[0], (v) => { this.score.querySelector('.blue').textContent = v; });
    set('kr', game.kills[1], (v) => { this.score.querySelector('.red').textContent = v; });
    set('obj', `${game.drake}|${game.wardenBuff}|${game.myTeam}`, () => this.renderObjectives(game));
    // vitals
    const hpPct = Math.max(0, me.hp / me.maxHp);
    const shPct = Math.min(1, me.shield / me.maxHp);
    set('hp', `${me.hp}/${me.maxHp}/${me.shield}`, () => {
      this.panel.querySelector('.hpbar .fill').style.width = (hpPct * 100).toFixed(1) + '%';
      this.panel.querySelector('.hpbar .sh').style.width = (Math.min(1, hpPct + shPct) * 100).toFixed(1) + '%';
      this.panel.querySelector('.hpbar .txt').textContent = `${Math.ceil(me.hp)} / ${me.maxHp}${me.shield ? ` (+${me.shield})` : ''}`;
      this.panel.querySelector('.hpbar').classList.toggle('low', hpPct < 0.3);
    });
    set('xp', game.xpProgress().toFixed(3), (v) => { this.panel.querySelector('.xpbar .fill').style.width = v * 100 + '%'; });
    set('lv', d.lv, (v) => { this.panel.querySelector('.lvl').textContent = v; });
    set('gold', d.g, (v) => { this.panel.querySelector('.gold .g').textContent = v; if (this.shopOpen) this.refreshShop(); });
    set('items', d.it.join(','), () => { this.renderItems(); if (this.shopOpen) this.refreshShop(); });
    set('stats', JSON.stringify(d.st), () => {
      const s = d.st;
      this.panel.querySelector('.stats').innerHTML = `<span title="Attack Damage">⚔ ${s.ad}</span><span title="Ability Power">✦ ${s.ap}</span><span title="Armor">🛡 ${s.ar}</span><span title="Magic Resist">🌀 ${s.mr}</span><span title="Attack Speed">⚡ ${s.as}</span><span title="Move Speed">👢 ${s.ms}</span>`;
    });
    const sbme = game.scoreboard.get(me.id);
    if (sbme) set('kda', `${sbme.k}/${sbme.d}/${sbme.a}/${sbme.cs}`, () => {
      this.tr.querySelector('.kda').textContent = `${sbme.k} / ${sbme.d} / ${sbme.a}`;
      this.tr.querySelector('.cs').textContent = `🗡 ${sbme.cs}`;
    });
    set('net', `${Math.round(this.app.fps)}|${game.transport.local ? 'local' : Math.round(game.transport.ping)}`, () => {
      this.tr.querySelector('.net').textContent = `${Math.round(this.app.fps)} fps${game.transport.local ? '' : ` · ${Math.round(game.transport.ping)} ms`}`;
    });
    // abilities
    const ids = ['q', 'e', 'r', 'd'];
    for (let i = 0; i < 4; i++) {
      const s = ids[i];
      const el = this.abEls[s];
      const cd = d.cd[i], max = d.cdm[i];
      const locked = s === 'r' && d.lv < ULT_LEVEL;
      const key = `ab${s}`;
      const val = `${cd.toFixed(1)}|${locked}|${s === 'q' ? d.zs : ''}`;
      set(key, val, () => {
        const pct = cd > 0 ? Math.min(1, cd / max) : 0;
        el.querySelector('.cd').style.setProperty('--p', (pct * 360).toFixed(0) + 'deg');
        el.querySelector('.cdt').textContent = cd > 0 ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : '';
        el.classList.toggle('ready', cd <= 0 && !locked);
        el.classList.toggle('locked', locked);
        if (s === 'q' && me.def.id === 'zephyr') el.classList.toggle('charged', d.zs >= 2);
      });
    }
    this.abEls.b.classList.toggle('active', !!(me.flags & F.RECALL));
    // death
    const dead = !!(me.flags & F.DEAD);
    set('dead', dead, (v) => this.death.classList.toggle('hidden', !v));
    if (dead) set('rs', Math.ceil(d.rs), (v) => { this.death.querySelector('b').textContent = v; });
    // shop availability
    set('inshop', !!d.sh, (v) => this.panel.querySelector('.shopbtn').classList.toggle('glow', v));
    // joystick visual
    if (this.joyEl) {
      const j = this.app.input.joy;
      this.joyEl.classList.toggle('on', j.active);
      if (j.active) {
        this.joyEl.style.transform = `translate(${j.ox - 60}px, ${j.oy - 60}px)`;
        this.joyEl.firstChild.style.transform = `translate(${j.x * 42}px, ${j.y * 42}px)`;
      }
      if (this.app.input.aiming && this.app.input.aiming.source === 'touch') this.cancelZone.classList.add('show');
    }
    // minimap
    this.mmAcc += dt;
    if (this.mmAcc > 0.1) { this.mmAcc = 0; this.drawMinimap(game); }
    if (this.scoreOpen && Math.random() < 0.1) this.renderScore();
  }

  renderObjectives(game) {
    const my = game.myTeam;
    const ds = game.drake;
    const wb = game.wardenBuff;
    let html = '';
    if (ds[my]) html += `<span class="obj good" title="Ember Soul: +${ds[my] * 6}% damage">🐉×${ds[my]}</span>`;
    if (ds[1 - my]) html += `<span class="obj bad" title="Enemy Ember Soul">🐉×${ds[1 - my]}</span>`;
    if (wb[my]) html += `<span class="obj good" title="Warden's Blessing">👁 ${wb[my]}s</span>`;
    if (wb[1 - my]) html += `<span class="obj bad" title="Enemy Warden's Blessing">👁 ${wb[1 - my]}s</span>`;
    this.objectives.innerHTML = html;
  }

  renderItems() {
    const d = this.game.meData;
    const el = this.panel.querySelector('.items');
    let html = '';
    for (let i = 0; i < 6; i++) {
      const id = d.it[i];
      html += id ? `<div class="it" title="${ITEM_BY_ID[id].name}: ${ITEM_BY_ID[id].desc}">${ITEM_BY_ID[id].icon}</div>` : '<div class="it empty"></div>';
    }
    el.innerHTML = html;
  }

  // ---------------------------------------------------------------- overhead bars
  updateBars(game) {
    const R = game.R;
    const W = R.canvas.clientWidth, H = R.canvas.clientHeight;
    const P = { x: 0, y: 0, visible: false };
    const seen = new Set();
    const cx = game.cam.x, cz = game.cam.z;
    const show = (key, ent, y, kind) => {
      projectPoint(R.vp, ent.x, y, ent.z, W, H, P);
      if (!P.visible) return;
      seen.add(key);
      let b = this.barPool.get(key);
      if (!b) {
        b = h('div', 'obar ' + kind);
        b.innerHTML = kind === 'hero' ? '<div class="nm"><b class="lv"></b><span></span></div><div class="bar"><i class="sh"></i><i class="fill"></i></div>' : '<div class="bar"><i class="fill"></i></div>';
        this.bars.appendChild(b);
        b._fill = b.querySelector('.fill');
        b._sh = b.querySelector('.sh');
        this.barPool.set(key, b);
      }
      const ally = ent.team === game.myTeam;
      const cls = ent === game.me ? 'me' : ent.team === 2 ? 'neutral' : ally ? 'ally' : 'enemy';
      if (b._cls !== cls) { b.classList.remove('me', 'ally', 'enemy', 'neutral'); b.classList.add(cls); b._cls = cls; }
      const pct = Math.max(0, Math.min(1, ent.hp / ent.maxHp));
      const k = (pct * 100).toFixed(1);
      if (b._pct !== k) { b._fill.style.width = k + '%'; b._pct = k; }
      if (kind === 'hero') {
        const sh = Math.min(1, pct + (ent.shield || 0) / ent.maxHp);
        b._sh.style.width = (sh * 100).toFixed(1) + '%';
        const nm = `${ent.level}|${ent.name}`;
        if (b._nm !== nm) { b.querySelector('.lv').textContent = ent.level; b.querySelector('span').textContent = ent.name; b._nm = nm; }
      }
      const scale = Math.max(0.6, Math.min(1.15, 26 / P.depth));
      b.style.transform = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      b.style.opacity = '1';
    };
    for (const v of game.heroes.values()) {
      if (v.flags & F.DEAD) continue;
      if ((v.flags & F.STEALTH) && v.team !== game.myTeam) continue;
      if ((v.x - cx) ** 2 + (v.z - cz) ** 2 > 75 * 75) continue;
      show('h' + v.id, v, (v.y || 0) + 3.0 * (v.model.scale || 1), 'hero');
    }
    for (const v of game.units.values()) {
      if (v.deadAt >= 0) continue;
      if ((v.x - cx) ** 2 + (v.z - cz) ** 2 > 45 * 45) continue;
      if (v.team === 2 && v.hp >= v.maxHp && v.kind !== K.DRAKE && v.kind !== K.WARDEN) continue;
      const big = v.kind === K.DRAKE || v.kind === K.WARDEN;
      show('u' + v.id, v, (v.y || 0) + (big ? 8.5 : v.kind >= K.WOLF ? 3.2 * v.model.scale : 2.3), big ? 'boss' : 'unit');
    }
    for (const s of game.structs.values()) {
      if (s.dead) continue;
      if ((s.x - cx) ** 2 + (s.z - cz) ** 2 > 90 * 90) continue;
      show('s' + s.id, s, heightAt(s.x, s.z) + (s.kind === K.SPIRE ? 17 : 12.5), 'struct');
    }
    for (const [key, b] of this.barPool) {
      if (!seen.has(key)) {
        if (key[0] === 'u' && !game.units.has(+key.slice(1))) { b.remove(); this.barPool.delete(key); }
        else if (b.style.opacity !== '0') b.style.opacity = '0';
      }
    }
  }

  // ---------------------------------------------------------------- minimap
  buildMinimapBg() {
    const c = document.createElement('canvas');
    c.width = c.height = 360;
    const g = c.getContext('2d');
    const P = (x, z) => this.mmPos(x, z);
    g.fillStyle = '#20331f';
    g.fillRect(0, 0, 360, 360);
    g.fillStyle = '#2c4a2a';
    g.fillRect(18, 18, 324, 324);
    // river
    g.strokeStyle = '#3a7a8a';
    g.lineWidth = 16;
    g.beginPath();
    let p = P(-118, -118); g.moveTo(p[0], p[1]); p = P(118, 118); g.lineTo(p[0], p[1]); g.stroke();
    // lanes
    g.strokeStyle = '#a89470';
    g.lineWidth = 10;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pts of Object.values(LANES)) {
      g.beginPath();
      pts.forEach(([x, z], i) => { const q = P(x, z); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
      g.stroke();
    }
    for (const t of [0, 1]) {
      const q = P(SPIRE_POS[t][0], SPIRE_POS[t][1]);
      g.fillStyle = t ? 'rgba(220,90,80,0.35)' : 'rgba(80,140,230,0.35)';
      g.beginPath(); g.arc(q[0], q[1], 34, 0, Math.PI * 2); g.fill();
    }
    return c;
  }
  mmPos(x, z) {
    // own base bottom-left: rotate for the red team
    const flip = this.game && this.game.myTeam === 1 ? -1 : 1;
    const k = 360 / 240;
    return [180 + x * flip * k, 180 + z * flip * k];
  }
  drawMinimap(game) {
    if (!this.mmBgTeam || this.mmBgTeam !== game.myTeam + 1) { this.mmBg = this.buildMinimapBg(); this.mmBgTeam = game.myTeam + 1; }
    const g = this.mm.getContext('2d');
    g.drawImage(this.mmBg, 0, 0);
    const P = (x, z) => this.mmPos(x, z);
    const teamCol = (t) => (t === game.myTeam ? '#5ab0ff' : t === 2 ? '#ffb347' : '#ff5a5a');
    // camps
    const camps = [...CAMPS, ...BOSSES];
    camps.forEach((c, i) => {
      const q = P(c.pos[0], c.pos[1]);
      const timer = game.campTimers[i];
      const boss = c.type === 'drake' || c.type === 'warden';
      g.fillStyle = timer ? 'rgba(255,255,255,0.18)' : boss ? (c.type === 'drake' ? '#ff7a3a' : '#b07aff') : '#e0c070';
      g.beginPath(); g.arc(q[0], q[1], boss ? 9 : 5, 0, Math.PI * 2); g.fill();
      if (timer && boss) { g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText(Math.ceil(timer), q[0], q[1] + 5); }
    });
    for (const s of game.structs.values()) {
      if (s.dead) continue;
      const q = P(s.x, s.z);
      g.fillStyle = teamCol(s.team);
      const sz = s.kind === K.SPIRE ? 16 : 10;
      g.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz);
      g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz);
    }
    for (const u of game.units.values()) {
      if (u.deadAt >= 0) continue;
      const q = P(u.x, u.z);
      g.fillStyle = teamCol(u.team);
      const r = u.team === 2 ? 0 : 3;
      if (r) { g.beginPath(); g.arc(q[0], q[1], r, 0, Math.PI * 2); g.fill(); }
    }
    for (const v of game.heroes.values()) {
      if (v.flags & F.DEAD) continue;
      if ((v.flags & F.STEALTH) && v.team !== game.myTeam) continue;
      const q = P(v.x, v.z);
      const meV = v === game.me;
      g.fillStyle = teamCol(v.team);
      g.strokeStyle = meV ? '#fff' : '#000';
      g.lineWidth = meV ? 4 : 2;
      g.beginPath(); g.arc(q[0], q[1], meV ? 11 : 9, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
      g.fillText(v.def.name[0], q[0], q[1] + 4);
    }
    // camera direction
    if (game.me) {
      const q = P(game.me.x, game.me.z);
      const flip = game.myTeam === 1 ? -1 : 1;
      const a = game.cam.yaw;
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(q[0], q[1]);
      g.lineTo(q[0] + Math.sin(a - 0.5) * 40 * flip, q[1] + Math.cos(a - 0.5) * 40 * flip);
      g.moveTo(q[0], q[1]);
      g.lineTo(q[0] + Math.sin(a + 0.5) * 40 * flip, q[1] + Math.cos(a + 0.5) * 40 * flip);
      g.stroke();
    }
  }

  // ---------------------------------------------------------------- feedback
  floatText(x, y, text, cls, big = false) {
    let el = this.floatPool.pop();
    if (!el) el = h('div', 'float');
    el.className = `float ${cls}${big ? ' big' : ''}`;
    el.textContent = text;
    el.style.left = (x + (Math.random() - 0.5) * 30).toFixed(0) + 'px';
    el.style.top = y.toFixed(0) + 'px';
    this.floats.appendChild(el);
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    setTimeout(() => { el.remove(); if (this.floatPool.length < 60) this.floatPool.push(el); }, 1000);
  }
  hurt(a) { this.hurtAmt = Math.min(0.9, this.hurtAmt + a * 0.6); }
  toast(text, kind = '') {
    this.toastEl.textContent = text;
    this.toastEl.className = 'toast show ' + kind;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { this.toastEl.className = 'toast'; }, 1800);
  }
  announce(text, good, kind, who) {
    const el = h('div', `ann ${good === true ? 'good' : good === false ? 'bad' : 'neutral'} ${kind}`);
    el.innerHTML = `<div class="t">${esc(text)}</div>${who && who.def ? `<div class="w">${esc(who.name)}</div>` : ''}`;
    this.ann.innerHTML = '';
    this.ann.appendChild(el);
    clearTimeout(this.annT);
    this.annT = setTimeout(() => el.classList.add('out'), 2600);
  }
  killfeed(killer, victim, assists, game) {
    if (!victim) return;
    const nm = (e) => esc(e ? (e.def ? e.name : e.kind === K.TOWER || e.kind === K.SPIRE ? 'Tower' : 'Minion') : 'Executed');
    const cls = (e) => (!e ? 'neutral' : e.team === game.myTeam ? 'ally' : e.team === 2 ? 'neutral' : 'enemy');
    const el = h('div', 'kf', `<span class="${cls(killer)}">${nm(killer)}</span>${assists.length ? `<small>+${assists.length}</small>` : ''}<i>⚔</i><span class="${cls(victim)}">${nm(victim)}</span>`);
    this.feed.prepend(el);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 7000);
    setTimeout(() => el.remove(), 7600);
  }
  levelUp(l) {
    const p = this.panel.querySelector('.portrait');
    p.classList.remove('lvup'); void p.offsetWidth; p.classList.add('lvup');
    if (l === ULT_LEVEL) this.abEls.r.classList.add('unlock');
  }
  respawned() { this.death.classList.add('hidden'); }
  bought() { this.renderItems(); }

  // ---------------------------------------------------------------- shop
  buildShop() {
    const g = this.game;
    const def = g.me.def;
    this.shop.innerHTML = `
      <div class="mhead"><h2>Armory</h2><span class="gold-amt">💰 <b>0</b></span><button class="close">✕</button></div>
      <div class="shop-note"></div>
      <div class="rec"><h3>Recommended for ${def.name}</h3><div class="row"></div><button class="quick">⚡ Quick Buy next (F)</button></div>
      <div class="grid"></div>
      <div class="owned"><h3>Inventory <small>(click to sell for 70%)</small></h3><div class="row"></div></div>`;
    this.shop.querySelector('.close').onclick = () => this.toggleShop(false);
    this.shop.querySelector('.quick').onclick = () => g.quickBuy();
    this.refreshShop();
  }
  refreshShop() {
    const g = this.game;
    const d = g.meData || { g: 500, it: [], sh: 1 };
    const def = g.me.def;
    this.shop.querySelector('.gold-amt b').textContent = d.g;
    this.shop.querySelector('.shop-note').textContent = d.sh ? '' : 'Return to your base (or wait until you respawn) to buy items.';
    const card = (it) => {
      const owned = d.it.includes(it.id);
      const can = d.g >= it.cost && d.sh && !(it.unique && owned);
      return `<div class="item ${can ? 'can' : ''} ${owned ? 'owned' : ''}" data-id="${it.id}"><div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div><div class="cost">${it.cost}g</div></div>`;
    };
    this.shop.querySelector('.rec .row').innerHTML = def.build.map((id) => card(ITEM_BY_ID[id])).join('');
    this.shop.querySelector('.grid').innerHTML = ITEMS.map(card).join('');
    this.shop.querySelector('.owned .row').innerHTML = d.it.map((id, i) => `<div class="item sell" data-i="${i}"><div class="ic">${ITEM_BY_ID[id].icon}</div><div class="nm">${ITEM_BY_ID[id].name}</div><div class="cost">+${Math.round(ITEM_BY_ID[id].cost * 0.7)}g</div></div>`).join('') || '<div class="empty-inv">Empty</div>';
    for (const el of this.shop.querySelectorAll('.item[data-id]')) el.onclick = () => g.buy(el.dataset.id);
    for (const el of this.shop.querySelectorAll('.item[data-i]')) el.onclick = () => g.sell(+el.dataset.i);
  }
  toggleShop(v = !this.shopOpen) {
    this.shopOpen = v;
    this.shop.classList.toggle('hidden', !v);
    if (v) { this.refreshShop(); this.app.input.exitLock(); this.app.input.attack = false; }
  }

  // ---------------------------------------------------------------- scoreboard / menu
  toggleScore(v = !this.scoreOpen) {
    this.scoreOpen = v;
    this.sb.classList.toggle('hidden', !v);
    if (v) this.renderScore();
  }
  renderScore() {
    const g = this.game;
    const row = (v) => {
      const s = g.scoreboard.get(v.id) || { k: 0, d: 0, a: 0, cs: 0, items: [], level: 1, gold: 0 };
      return `<tr class="${v === g.me ? 'me' : ''}"><td class="hn"><span class="dot" style="background:${hexCss(v.def.palette.primary)}"></span>${esc(v.name)}${v.bot ? ' <small>BOT</small>' : ''}<br><small>${ROLE_ICONS[v.def.role]} ${v.def.role}</small></td><td>${s.level}</td><td>${s.k}/${s.d}/${s.a}</td><td>${s.cs}</td><td class="its">${s.items.map((i) => ITEM_BY_ID[i]?.icon || '').join('')}</td><td>${s.gold}</td></tr>`;
    };
    const team = (t) => [...g.heroes.values()].filter((v) => v.team === t).map(row).join('');
    this.sb.innerHTML = `<div class="mhead"><h2>Scoreboard</h2><button class="close">✕</button></div>
      <div class="teams">
      ${[g.myTeam, 1 - g.myTeam].map((t) => `<div class="team t${t === g.myTeam ? 'ally' : 'enemy'}"><h3>${TEAM_NAMES[t]} ${t === g.myTeam ? '(You)' : ''} — ${g.kills[t]} kills</h3><table><tr><th>Champion</th><th>Lv</th><th>K/D/A</th><th>CS</th><th>Items</th><th>Gold</th></tr>${team(t)}</table></div>`).join('')}
      </div>`;
    this.sb.querySelector('.close').onclick = () => this.toggleScore(false);
  }
  toggleMenu(v = !this.menuOpen) {
    this.menuOpen = v;
    this.menu.classList.toggle('hidden', !v);
    if (v) {
      this.app.input.exitLock();
      this.menu.innerHTML = `<div class="mhead"><h2>Paused</h2></div>
        <button class="big resume">Resume</button><button class="big settings">Settings</button><button class="big leave">Leave Match</button>
        <p class="hint">${this.game.transport.local ? 'Offline match vs. bots — the game is paused while this menu is open.' : 'Online match — the game keeps running.'}</p>`;
      if (this.game.transport.local) this.game.transport.paused = true;
      this.menu.querySelector('.resume').onclick = () => this.toggleMenu(false);
      this.menu.querySelector('.settings').onclick = () => this.app.menus.openSettings(true);
      this.menu.querySelector('.leave').onclick = () => { this.toggleMenu(false); this.app.leaveMatch(); };
    } else if (this.game && this.game.transport.local) this.game.transport.paused = false;
  }

  endScreen(win, game) {
    const el = h('div', 'endscreen ' + (win ? 'win' : 'lose'));
    const mine = game.scoreboard.get(game.myId) || { k: 0, d: 0, a: 0, cs: 0 };
    const rows = [...game.heroes.values()].sort((a, b) => (game.scoreboard.get(b.id)?.k || 0) - (game.scoreboard.get(a.id)?.k || 0));
    const mvp = rows.find((v) => v.team === (win ? game.myTeam : 1 - game.myTeam));
    el.innerHTML = `<div class="banner">${win ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="sub">${win ? 'The enemy Spire has fallen.' : 'Your Spire has fallen.'} · ${fmtTime(game.latestT)}</div>
      <div class="mystats"><div><b>${mine.k}/${mine.d}/${mine.a}</b><span>K / D / A</span></div><div><b>${mine.cs}</b><span>Creep score</span></div><div><b>${game.kills[game.myTeam]} - ${game.kills[1 - game.myTeam]}</b><span>Team kills</span></div>${mvp ? `<div><b>${esc(mvp.name)}</b><span>MVP</span></div>` : ''}</div>
      <div class="btns"><button class="big again">Play Again</button><button class="big menu">Main Menu</button></div>`;
    this.root.appendChild(el);
    this.app.input.exitLock();
    el.querySelector('.again').onclick = () => this.app.playAgain();
    el.querySelector('.menu').onclick = () => this.app.leaveMatch();
  }
}
