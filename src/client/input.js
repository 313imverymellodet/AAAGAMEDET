// Unified desktop (mouse + keyboard, pointer lock) and mobile (twin-stick touch) input.
export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.touch = isTouch();
    this.keys = new Set();
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.zoomDelta = 0;
    this.attack = false;
    this.events = []; // {type:'press'|'release'|'cancel', slot, drag?:{x,y,len}}
    this.aiming = null; // {slot, drag:{x,y,len}|null, source:'key'|'touch'}
    this.joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: -1, x: 0, y: 0 };
    this.enabled = false;
    this.locked = false;
    this.rmb = false;
    this.onToggle = {}; // shop, score, menu callbacks
    this.lastTouchLook = 0;
    this.bind();
  }

  bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.attack = false; if (this.aiming) this.cancelAim(); });
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (e.button === 0) {
        if (!this.locked && this.settings.pointerLock !== false) { this.requestLock(); }
        if (this.aiming && this.aiming.source === 'key') { this.releaseAim(); return; }
        this.attack = true;
      }
      if (e.button === 2) {
        if (this.aiming) { this.cancelAim(); return; }
        this.rmb = true;
      }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.attack = false; if (e.button === 2) this.rmb = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.touch) return;
      if (this.locked || this.rmb) {
        const s = (this.settings.sensitivity || 1) * 0.0026;
        this.yawDelta -= e.movementX * s;
        this.pitchDelta += e.movementY * s * (this.settings.invertY ? -1 : 1);
      }
    });
    c.addEventListener('wheel', (e) => { if (this.enabled) { this.zoomDelta += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.attack = false;
      this.onToggle.lock?.(this.locked);
    });
    // touch: joystick on the left half, camera look on the right half
    c.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    c.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    c.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    c.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } });
    } catch { /* pointer lock unsupported */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  onKey(e, down) {
    if (!this.enabled) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.code;
    if (down && e.repeat) { if (k === 'Tab') e.preventDefault(); return; }
    if (down) this.keys.add(k); else this.keys.delete(k);
    const slotKey = { KeyQ: 'q', KeyE: 'e', KeyR: 'r', Digit1: 'q', Digit2: 'e', Digit3: 'r' }[k];
    if (slotKey) {
      if (down) this.beginAim(slotKey, 'key');
      else if (this.aiming && this.aiming.slot === slotKey && this.aiming.source === 'key') this.releaseAim();
      e.preventDefault();
      return;
    }
    if (!down) {
      if (k === 'Tab') this.onToggle.score?.(false);
      return;
    }
    switch (k) {
      case 'Space': case 'ShiftLeft': case 'ShiftRight': this.events.push({ type: 'press', slot: 'd' }); e.preventDefault(); break;
      case 'KeyB': this.events.push({ type: 'press', slot: 'b' }); break;
      case 'KeyP': this.onToggle.shop?.(); break;
      case 'Tab': this.onToggle.score?.(true); e.preventDefault(); break;
      case 'Escape': this.onToggle.menu?.(); break;
      case 'KeyF': this.events.push({ type: 'quickbuy' }); break;
    }
  }

  beginAim(slot, source, drag = null) {
    if (this.aiming) this.cancelAim();
    this.aiming = { slot, source, drag, t: performance.now() };
  }
  releaseAim() {
    if (!this.aiming) return;
    this.events.push({ type: 'cast', slot: this.aiming.slot, drag: this.aiming.drag, source: this.aiming.source, quick: this.aiming.source === 'touch' && (!this.aiming.drag || this.aiming.drag.len < 0.18) });
    this.aiming = null;
  }
  cancelAim() { this.aiming = null; }

  // ---- touch
  onTouchStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const w = window.innerWidth;
    for (const t of e.changedTouches) {
      if (t.clientX < w * 0.42 && !this.joy.active) {
        this.joy = { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
      } else if (this.look.id < 0) {
        this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
        this.lastTouchLook = performance.now();
      }
    }
  }
  onTouchMove(e) {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        const dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const max = 60;
        const l = Math.hypot(dx, dy);
        const k = l > max ? max / l : 1;
        this.joy.x = (dx * k) / max; this.joy.y = (dy * k) / max;
        if (l > max * 1.4) { this.joy.ox = t.clientX - (dx / l) * max; this.joy.oy = t.clientY - (dy / l) * max; }
      } else if (t.identifier === this.look.id) {
        const s = (this.settings.sensitivity || 1) * 0.0065;
        this.yawDelta -= (t.clientX - this.look.x) * s;
        this.pitchDelta += (t.clientY - this.look.y) * s * 0.7 * (this.settings.invertY ? -1 : 1);
        this.look.x = t.clientX; this.look.y = t.clientY;
        this.lastTouchLook = performance.now();
      }
    }
  }
  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) this.joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
      if (t.identifier === this.look.id) this.look = { id: -1, x: 0, y: 0 };
    }
  }

  // HUD buttons call these (mobile)
  bindTouchButton(el, slot) {
    let id = -1, sx = 0, sy = 0;
    const R = 95;
    const start = (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches ? e.changedTouches[0] : e;
      id = t.identifier ?? 'mouse';
      sx = t.clientX; sy = t.clientY;
      if (slot === 'atk') { this.attack = true; el.classList.add('down'); return; }
      if (slot === 'd' || slot === 'b') { this.events.push({ type: 'press', slot }); el.classList.add('down'); return; }
      this.beginAim(slot, 'touch', { x: 0, y: 0, len: 0, sx, sy });
      el.classList.add('down');
    };
    const move = (e) => {
      if (id === -1) return;
      const list = e.changedTouches ? [...e.changedTouches] : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== id) continue;
        e.preventDefault();
        if (this.aiming && this.aiming.slot === slot) {
          const dx = t.clientX - sx, dy = t.clientY - sy;
          const l = Math.hypot(dx, dy);
          const k = Math.min(1, l / R);
          this.aiming.drag = { x: l ? dx / l : 0, y: l ? dy / l : 0, len: k, sx, sy, cx: t.clientX, cy: t.clientY };
          this.onToggle.aimMove?.(t.clientX, t.clientY);
        }
      }
    };
    const end = (e) => {
      if (id === -1) return;
      const list = e.changedTouches ? [...e.changedTouches] : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== id) continue;
        id = -1;
        el.classList.remove('down');
        if (slot === 'atk') { this.attack = false; return; }
        if (this.aiming && this.aiming.slot === slot) {
          if (this.onToggle.inCancel?.(t.clientX, t.clientY)) this.cancelAim();
          else this.releaseAim();
        }
        this.onToggle.aimEnd?.();
      }
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
    // mouse fallback (e.g. touch-screen laptops / testing)
    el.addEventListener('mousedown', (e) => { if (!this.touch) return; start(e); const mm = (ev) => move(ev); const mu = (ev) => { end(ev); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); }; window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); });
  }

  // movement in camera space: x = right, y = forward
  moveVector() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.joy.active) { x += this.joy.x; y -= this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    if (l < 0.12) { x = 0; y = 0; }
    return [x, y];
  }

  takeLook() {
    const r = [this.yawDelta, this.pitchDelta, this.zoomDelta];
    this.yawDelta = 0; this.pitchDelta = 0; this.zoomDelta = 0;
    return r;
  }
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
