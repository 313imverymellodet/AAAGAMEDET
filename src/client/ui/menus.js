// Title screen, champion select, online lobby, settings and how-to-play.
import { HEROES, HERO_BY_ID, ROLE_ICONS } from '../../shared/heroes.js';
import { TEAM_NAMES } from '../../shared/constants.js';
import { GLYPHS } from './hud.js';
import { NetTransport } from '../net.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

export class Menus {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('menu');
    this.sel = { hero: app.settings.lastHero || 'kaelen', team: 0, size: 5, diff: 'normal' };
    this.net = null;
    this.lobby = null;
  }

  show() { this.root.style.display = 'flex'; }
  hide() { this.root.style.display = 'none'; }

  click() { this.app.audio.unlock(); this.app.audio.play('click'); }

  // ---------------------------------------------------------------- title
  title() {
    this.app.scene.mode = 'title';
    this.closeNet();
    this.show();
    this.root.innerHTML = '';
    const el = h('div', 'screen title-screen');
    el.innerHTML = `
      <div class="logo"><div class="crest">◆</div><h1>SPIREBREAK</h1><p>Third-person action arena · 5v5 · Break their Spire</p></div>
      <div class="main-btns">
        <button class="big primary" data-a="ai">⚔ Play vs AI</button>
        <button class="big" data-a="online">🌐 Play Online</button>
        <button class="big" data-a="how">📖 How to Play</button>
        <button class="big" data-a="settings">⚙ Settings</button>
      </div>
      <div class="foot">10 champions · desktop &amp; mobile · no install</div>`;
    this.root.appendChild(el);
    el.querySelector('[data-a=ai]').onclick = () => { this.click(); this.champSelect('ai'); };
    el.querySelector('[data-a=online]').onclick = () => { this.click(); this.onlineEntry(); };
    el.querySelector('[data-a=how]').onclick = () => { this.click(); this.howTo(); };
    el.querySelector('[data-a=settings]').onclick = () => { this.click(); this.openSettings(false); };
  }

  // ---------------------------------------------------------------- champion grid (shared)
  champGrid(container, onPick, takenByTeam = null) {
    const grid = h('div', 'champ-grid');
    for (const d of HEROES) {
      const taken = takenByTeam && takenByTeam.has(d.id);
      const c = h('button', `champ ${d.id === this.sel.hero ? 'sel' : ''} ${taken ? 'taken' : ''}`);
      c.style.setProperty('--c', hexCss(d.palette.primary));
      c.style.setProperty('--c2', hexCss(d.palette.accent));
      c.innerHTML = `<div class="glyph">${GLYPHS[d.id][2]}</div><div class="cn">${d.name}</div><div class="cr">${ROLE_ICONS[d.role]} ${d.role}</div>`;
      c.onclick = () => {
        if (taken) return;
        this.click();
        this.sel.hero = d.id;
        for (const x of grid.children) x.classList.remove('sel');
        c.classList.add('sel');
        onPick(d.id);
      };
      grid.appendChild(c);
    }
    container.appendChild(grid);
    return grid;
  }

  champDetail(el, id) {
    const d = HERO_BY_ID[id];
    const ab = (k, i) => `<div class="abil"><div class="g">${GLYPHS[d.id][i]}</div><div><b>${k.toUpperCase()} · ${d[k].name}</b> <small>${d[k].cd}s</small><p>${d[k].desc}</p></div></div>`;
    el.innerHTML = `<div class="dh"><h2>${d.name}</h2><span class="ttl">${d.title}</span></div>
      <div class="tags"><span>${ROLE_ICONS[d.role]} ${d.role}</span><span>${d.ranged ? '🏹 Ranged' : '⚔ Melee'}</span><span title="Difficulty">${stars(d.difficulty)}</span></div>
      <p class="lore">${d.lore}</p>
      <div class="abil passive"><div class="g">◈</div><div><b>Passive</b><p>${d.passive}</p></div></div>
      ${ab('q', 0)}${ab('e', 1)}${ab('r', 2)}`;
    this.app.scene.showcase(id);
  }

  // ---------------------------------------------------------------- vs AI
  champSelect() {
    this.app.scene.mode = 'select';
    this.root.innerHTML = '';
    const el = h('div', 'screen select-screen');
    el.innerHTML = `<div class="topbar"><button class="back">← Back</button><h2>Choose your champion</h2></div>
      <div class="cols"><div class="left"></div><div class="detail"></div></div>
      <div class="opts">
        <label>Name <input class="name" maxlength="16" value="${esc(this.app.settings.name || 'Player')}"></label>
        <div class="seg team"><span>Side</span><button data-v="0">🌅 ${TEAM_NAMES[0]}</button><button data-v="1">🌙 ${TEAM_NAMES[1]}</button></div>
        <div class="seg size"><span>Mode</span><button data-v="1">1v1</button><button data-v="3">3v3</button><button data-v="5">5v5</button></div>
        <div class="seg diff"><span>Bots</span><button data-v="easy">Easy</button><button data-v="normal">Normal</button><button data-v="hard">Hard</button></div>
        <button class="big primary start">▶ Start Match</button>
      </div>`;
    this.root.appendChild(el);
    const detail = el.querySelector('.detail');
    this.champGrid(el.querySelector('.left'), (id) => this.champDetail(detail, id));
    this.champDetail(detail, this.sel.hero);
    const seg = (cls, key, parse) => {
      const s = el.querySelector('.' + cls);
      const btns = [...s.querySelectorAll('button')];
      const refresh = () => btns.forEach((b) => b.classList.toggle('on', String(this.sel[key]) === b.dataset.v));
      btns.forEach((b) => (b.onclick = () => { this.click(); this.sel[key] = parse(b.dataset.v); refresh(); }));
      refresh();
    };
    seg('team', 'team', Number);
    seg('size', 'size', Number);
    seg('diff', 'diff', String);
    el.querySelector('.back').onclick = () => { this.click(); this.title(); };
    el.querySelector('.start').onclick = () => {
      this.click();
      const name = el.querySelector('.name').value.trim().slice(0, 16) || 'Player';
      this.app.settings.name = name;
      this.app.settings.lastHero = this.sel.hero;
      this.app.saveSettings();
      this.app.startLocal({ hero: this.sel.hero, team: this.sel.team, teamSize: this.sel.size, difficulty: this.sel.diff, name });
    };
  }

  // ---------------------------------------------------------------- online
  closeNet() {
    if (this.net) { this.net.close(); this.net = null; }
    this.lobby = null;
  }

  onlineEntry(err) {
    this.app.scene.mode = 'title';
    this.closeNet();
    this.root.innerHTML = '';
    const el = h('div', 'screen online-screen');
    el.innerHTML = `<div class="topbar"><button class="back">← Back</button><h2>Play Online</h2></div>
      <div class="card">
        <label>Name <input class="name" maxlength="16" value="${esc(this.app.settings.name || 'Player')}"></label>
        <button class="big primary quick">⚡ Quick Match</button>
        <button class="big create">➕ Create Private Room</button>
        <div class="join"><input class="code" maxlength="4" placeholder="CODE" autocapitalize="characters"><button class="big joinb">Join</button></div>
        <p class="err">${err ? esc(err) : ''}</p>
        <p class="hint">Rooms hold up to 10 players. Empty slots are filled by bots, and the host picks the team size.</p>
      </div>`;
    this.root.appendChild(el);
    const name = () => {
      const n = el.querySelector('.name').value.trim().slice(0, 16) || 'Player';
      this.app.settings.name = n; this.app.saveSettings();
      return n;
    };
    el.querySelector('.back').onclick = () => { this.click(); this.title(); };
    el.querySelector('.quick').onclick = () => { this.click(); this.connect({ t: 'quick', name: name(), hero: this.sel.hero }); };
    el.querySelector('.create').onclick = () => { this.click(); this.connect({ t: 'create', name: name(), hero: this.sel.hero }); };
    el.querySelector('.joinb').onclick = () => {
      this.click();
      const code = el.querySelector('.code').value.trim().toUpperCase();
      if (code.length !== 4) { el.querySelector('.err').textContent = 'Enter a 4-letter room code.'; return; }
      this.connect({ t: 'join', code, name: name(), hero: this.sel.hero });
    };
    const params = new URLSearchParams(location.search);
    if (params.get('room') && !err) { el.querySelector('.code').value = params.get('room').toUpperCase(); }
  }

  async connect(first) {
    const errEl = this.root.querySelector('.err');
    if (errEl) errEl.textContent = 'Connecting…';
    const net = new NetTransport();
    try {
      await net.connect();
    } catch (e) {
      this.onlineEntry(`${e.message}. Online play needs the Spirebreak server (npm start). Offline vs AI always works.`);
      return;
    }
    this.net = net;
    const handler = (m) => this.onNet(m);
    net.on(handler);
    this.netHandler = handler;
    net.send(first);
  }

  onNet(m) {
    switch (m.t) {
      case 'lobby': this.lobby = m; this.renderLobby(); break;
      case 'err': this.app.audio.play('deny'); this.toast(m.m); if (!this.lobby) this.onlineEntry(m.m); break;
      case 'start': {
        const net = this.net;
        net.off(this.netHandler);
        this.net = null;
        this.app.startOnline(net, m);
        break;
      }
      case 'closed': if (this.lobby) this.onlineEntry('Connection to server lost.'); break;
      case 'chat': this.lobbyChat(m.n, m.m); break;
    }
  }

  toast(text) {
    const t = h('div', 'mtoast', esc(text));
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  renderLobby() {
    const L = this.lobby;
    const me = L.players.find((p) => p.pid === L.you);
    if (me) this.sel.hero = me.hero;
    this.app.scene.mode = 'select';
    const keepChat = this.root.querySelector('.chatlog')?.innerHTML || '';
    this.root.innerHTML = '';
    const el = h('div', 'screen lobby-screen');
    const link = `${location.origin}${location.pathname}?room=${L.code}`;
    const teamList = (t) => L.players.filter((p) => p.team === t).map((p) => `<li class="${p.pid === L.you ? 'me' : ''}"><span class="g">${GLYPHS[p.hero][2]}</span>${esc(p.name)} <small>${HERO_BY_ID[p.hero].name}${p.host ? ' · 👑 host' : ''}</small></li>`).join('') +
      Array.from({ length: Math.max(0, L.size - L.players.filter((p) => p.team === t).length) }, () => '<li class="bot"><span class="g">🤖</span>Bot</li>').join('');
    el.innerHTML = `<div class="topbar"><button class="back">← Leave</button><h2>Room <span class="code">${L.code}</span></h2><button class="copy" title="Copy invite link">🔗 Invite</button></div>
      <div class="cols"><div class="left"></div><div class="detail"></div></div>
      <div class="lobby-side">
        <div class="teams"><div class="tm blue"><h3>🌅 ${TEAM_NAMES[0]}</h3><ul>${teamList(0)}</ul><button data-t="0">Join ${TEAM_NAMES[0]}</button></div>
        <div class="tm red"><h3>🌙 ${TEAM_NAMES[1]}</h3><ul>${teamList(1)}</ul><button data-t="1">Join ${TEAM_NAMES[1]}</button></div></div>
        ${L.host ? `<div class="hostopts"><div class="seg size"><span>Mode</span>${[1, 2, 3, 4, 5].map((n) => `<button data-v="${n}" class="${L.size === n ? 'on' : ''}">${n}v${n}</button>`).join('')}</div>
          <div class="seg diff"><span>Bots</span>${['easy', 'normal', 'hard'].map((d) => `<button data-v="${d}" class="${L.diff === d ? 'on' : ''}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
          <button class="big primary start">▶ Start Match</button></div>` : '<p class="hint wait">Waiting for the host to start…</p>'}
        <div class="chat"><div class="chatlog">${keepChat}</div><input class="chatin" maxlength="120" placeholder="Say something…"></div>
      </div>`;
    this.root.appendChild(el);
    const taken = new Set(L.players.filter((p) => p.team === (me ? me.team : 0) && p.pid !== L.you).map((p) => p.hero));
    const detail = el.querySelector('.detail');
    this.champGrid(el.querySelector('.left'), (id) => { this.champDetail(detail, id); this.net?.send({ t: 'pick', hero: id }); }, taken);
    this.champDetail(detail, this.sel.hero);
    el.querySelector('.back').onclick = () => { this.click(); this.onlineEntry(); };
    el.querySelector('.copy').onclick = () => {
      this.click();
      try { navigator.clipboard.writeText(link).then(() => this.toast('Invite link copied!'), () => this.toast(link)); } catch { this.toast(link); }
    };
    for (const b of el.querySelectorAll('.tm button')) b.onclick = () => { this.click(); this.net?.send({ t: 'team', team: +b.dataset.t }); };
    if (L.host) {
      for (const b of el.querySelectorAll('.size button')) b.onclick = () => { this.click(); this.net?.send({ t: 'cfg', size: +b.dataset.v }); };
      for (const b of el.querySelectorAll('.diff button')) b.onclick = () => { this.click(); this.net?.send({ t: 'cfg', diff: b.dataset.v }); };
      el.querySelector('.start').onclick = () => { this.click(); this.net?.send({ t: 'start' }); };
    }
    const chatIn = el.querySelector('.chatin');
    chatIn.onkeydown = (e) => {
      if (e.key === 'Enter' && chatIn.value.trim()) { this.net?.send({ t: 'chat', m: chatIn.value.trim().slice(0, 120) }); chatIn.value = ''; }
    };
  }

  lobbyChat(n, m) {
    const log = this.root.querySelector('.chatlog');
    if (!log) return;
    const line = h('div', 'cl', `<b>${esc(n)}:</b> ${esc(m)}`);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- settings
  openSettings(inGame) {
    const s = this.app.settings;
    const wrap = h('div', 'modal settings-modal');
    wrap.innerHTML = `<div class="mhead"><h2>Settings</h2><button class="close">✕</button></div>
      <div class="set">
        <div class="seg q"><span>Graphics</span><button data-v="low">Low</button><button data-v="medium">Medium</button><button data-v="high">High</button></div>
        <label>Look sensitivity <input type="range" min="0.3" max="2.5" step="0.05" data-k="sensitivity"></label>
        <label>Field of view <input type="range" min="50" max="80" step="1" data-k="fov"></label>
        <label>Master volume <input type="range" min="0" max="1" step="0.05" data-k="volume"></label>
        <label>Music <input type="range" min="0" max="1" step="0.05" data-k="music"></label>
        <label>Effects <input type="range" min="0" max="1" step="0.05" data-k="sfx"></label>
        <label class="ck"><input type="checkbox" data-k="invertY"> Invert vertical look</label>
        <label class="ck"><input type="checkbox" data-k="shake"> Camera shake</label>
        <label class="ck"><input type="checkbox" data-k="autoCam"> Auto-rotate camera while moving (touch)</label>
      </div>`;
    (inGame ? document.getElementById('hud') : this.root).appendChild(wrap);
    const q = wrap.querySelector('.q');
    const refreshQ = () => q.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.quality));
    q.querySelectorAll('button').forEach((b) => (b.onclick = () => { s.quality = b.dataset.v; refreshQ(); this.app.applyQuality(); this.app.saveSettings(); }));
    refreshQ();
    for (const inp of wrap.querySelectorAll('input[data-k]')) {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') { inp.checked = s[k] !== false && !!(s[k] ?? true); if (k === 'invertY') inp.checked = !!s.invertY; }
      else inp.value = s[k];
      inp.oninput = () => {
        s[k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
        this.app.audio.applyVolumes();
        this.app.saveSettings();
      };
    }
    wrap.querySelector('.close').onclick = () => wrap.remove();
  }

  // ---------------------------------------------------------------- how to play
  howTo() {
    this.root.innerHTML = '';
    const el = h('div', 'screen how-screen');
    el.innerHTML = `<div class="topbar"><button class="back">← Back</button><h2>How to Play</h2></div>
      <div class="howgrid">
        <div class="card"><h3>🎯 Goal</h3><p>Push down your lane's towers with your minions, then destroy the enemy <b>Spire</b>. Towers fall in order: outer → inner → guardian → Spire.</p>
        <p>Last-hit minions and monsters for gold, buy items at your base and level up to unlock your ultimate (level ${3}).</p>
        <p>Slay the <b>Ember Drake</b> (permanent damage for your team) and the <b>Ancient Warden</b> (a powerful timed buff) in the river. After 12:00 the <b>Siege Surge</b> empowers every minion wave.</p></div>
        <div class="card"><h3>🖱 Desktop</h3><ul>
          <li><b>WASD</b> move · <b>Mouse</b> look (click to lock)</li>
          <li><b>Left click</b> attack where you aim</li>
          <li><b>Q / E / R</b> hold to aim, release to cast · <b>Right click</b> cancels</li>
          <li><b>Space / Shift</b> dodge roll (invulnerable)</li>
          <li><b>B</b> recall · <b>P</b> shop · <b>F</b> quick-buy · <b>Tab</b> scoreboard</li></ul></div>
        <div class="card"><h3>📱 Mobile</h3><ul>
          <li>Left thumb: <b>joystick</b> anywhere on the left</li>
          <li>Right side: drag empty space to <b>turn the camera</b></li>
          <li><b>⚔</b> hold to auto-target attack</li>
          <li>Abilities: <b>tap</b> to smart-cast, or <b>drag</b> to aim. Release on ✕ to cancel</li>
          <li>Play in landscape. Add to your home screen for fullscreen.</li></ul></div>
        <div class="card"><h3>💡 Tips</h3><ul>
          <li>Don't fight under enemy towers early. They hit hard and ramp up.</li>
          <li>Red ground markings are enemy attacks. <b>Dodge</b> them!</li>
          <li>Skillshots must be aimed. Lead your targets.</li>
          <li>Stealth (Vex) breaks when she attacks.</li></ul></div>
      </div>`;
    this.root.appendChild(el);
    el.querySelector('.back').onclick = () => { this.click(); this.title(); };
  }
}
