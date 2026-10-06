// Procedural champion models + procedural animation.
import { humanoid } from './rig.js';
import { hex } from '../engine/mat.js';

const PI = Math.PI;
const steel = hex(0xb9c3cf), steelDark = hex(0x5d6773), gold = hex(0xe8bf5a), wood = hex(0x7a5534), leather = hex(0x5a3d2a), bone = hex(0xe6dfc8), black = hex(0x18151c);

function base(p, extra = {}) {
  return humanoid({
    skin: hex(p.skin), cloth: hex(p.primary), cloth2: hex(p.dark), dark: hex(p.dark), belt: hex(p.secondary), ...extra,
  });
}

const BUILDERS = {
  kaelen(p) {
    const r = base(p, { build: 1.12, sleeve: steel, forearm: steel, glove: steelDark, boots: steelDark, pants: hex(p.dark) });
    r.mesh('head', 'sphere', [0, 0.31, 0], null, [0.58, 0.6, 0.58], steel);
    r.mesh('head', 'box', [0, 0.3, 0.25], null, [0.38, 0.07, 0.1], hex(p.accent), { e: 1.2, outline: false });
    r.mesh('head', 'box', [0, 0.66, -0.02], [0.2, 0, 0], [0.08, 0.35, 0.5], hex(p.secondary));
    r.mesh('torso', 'box', [0, 0.42, 0.02], null, [0.8, 0.5, 0.48], steel);
    r.mesh('torso', 'octa', [0, 0.45, 0.25], null, [0.22, 0.28, 0.12], gold, { e: 0.5 });
    for (const s of ['L', 'R']) r.mesh('sh' + s, 'sphere', [0, 0.04, 0], null, [0.46, 0.36, 0.46], gold);
    r.joint('cape', 'torso', [0, 0.66, -0.25]);
    r.mesh('cape', 'box', [0, -0.6, -0.02], null, [0.78, 1.2, 0.05], hex(p.primary), { name: 'capeMesh' });
    r.joint('wpn', 'haR', [0, -0.08, 0.06]);
    r.mesh('wpn', 'cyl', [0, 0, 0], [PI / 2, 0, 0], [0.07, 0.3, 0.07], leather);
    r.mesh('wpn', 'box', [0, 0, 0.17], null, [0.42, 0.08, 0.08], gold);
    r.mesh('wpn', 'blade', [0, 0, 0.2], [PI / 2, 0, 0], [0.17, 1.35, 1], hex(0xe4ecf4), { e: 0.15, name: 'blade' });
    r.joint('shield', 'elL', [0.17, -0.28, 0.06]);
    r.mesh('shield', 'box', [0, 0, 0], null, [0.1, 1.0, 0.78], hex(p.primary));
    r.mesh('shield', 'box', [0.03, 0, 0], null, [0.08, 1.08, 0.86], gold);
    r.mesh('shield', 'octa', [0.08, 0.05, 0], null, [0.1, 0.4, 0.3], gold, { e: 0.4 });
    return { rig: r, style: 'sword', scale: 1.05 };
  },
  lyra(p) {
    const r = base(p, { build: 0.92, sleeve: hex(p.primary), glove: hex(p.skin), boots: hex(p.dark), eyeColor: hex(p.secondary), eyeGlow: 1.2 });
    r.mesh('head', 'sphere', [0, 0.36, -0.06], null, [0.58, 0.5, 0.6], hex(0x3a2a6a));
    r.mesh('head', 'cone', [0, 0.82, -0.08], [-0.25, 0, 0], [0.62, 0.9, 0.62], hex(p.primary));
    r.mesh('head', 'torus', [0, 0.52, -0.05], null, [0.78, 0.6, 0.78], hex(p.secondary), { e: 0.8 });
    r.mesh('hips', 'cone', [0, -0.42, 0], null, [1.0, 1.05, 0.85], hex(p.primary), { name: 'robe' });
    r.mesh('torso', 'box', [0, 0.5, 0.2], null, [0.3, 0.3, 0.06], hex(p.secondary), { e: 0.6 });
    r.joint('wpn', 'haR', [0, -0.05, 0.05]);
    r.mesh('wpn', 'cyl', [0, 0.25, 0], null, [0.08, 2.1, 0.08], wood);
    r.mesh('wpn', 'torus', [0, 1.35, 0], [PI / 2, 0, 0], [0.45, 0.45, 0.45], gold);
    r.mesh('wpn', 'gem', [0, 1.35, 0], null, [0.32, 0.32, 0.32], hex(p.secondary), { e: 1.6, name: 'orb', glow: true });
    return { rig: r, style: 'staff', scale: 1, tip: 'orb', aura: 'stars' };
  },
  vex(p) {
    const r = base(p, { build: 0.95, sleeve: hex(p.primary), forearm: hex(p.dark), glove: black, boots: black, eyeColor: hex(p.accent), eyeGlow: 2.2 });
    r.mesh('head', 'sphere', [0, 0.33, -0.04], null, [0.6, 0.62, 0.62], hex(p.primary), { name: 'hood' });
    r.mesh('head', 'cone', [0, 0.45, -0.32], [-1.2, 0, 0], [0.4, 0.5, 0.4], hex(p.primary));
    r.mesh('head', 'box', [0, 0.18, 0.2], null, [0.42, 0.16, 0.14], black);
    r.joint('scarf', 'torso', [0, 0.7, -0.15]);
    r.mesh('scarf', 'box', [0.1, -0.35, -0.12], [0.3, 0, 0.1], [0.2, 0.8, 0.04], hex(p.secondary), { name: 'scarfMesh' });
    r.mesh('torso', 'box', [0, 0.25, 0], null, [0.78, 0.08, 0.47], hex(p.secondary));
    for (const s of ['L', 'R']) {
      r.joint('wpn' + s, 'ha' + s, [0, -0.06, 0.04]);
      r.mesh('wpn' + s, 'box', [0, 0, 0.04], null, [0.07, 0.07, 0.16], leather);
      r.mesh('wpn' + s, 'blade', [0, 0, 0.1], [PI / 2, 0, 0], [0.13, 0.7, 1], hex(0xe03050), { e: 0.6, glow: true });
    }
    return { rig: r, style: 'daggers', scale: 0.98, aura: 'shadow' };
  },
  brakka(p) {
    const r = base(p, { build: 1.35, sleeve: hex(p.skin), forearm: hex(p.skin), glove: leather, boots: leather, pants: hex(p.dark), eyeColor: hex(p.accent), eyeGlow: 0.8 });
    r.mesh('torso', 'box', [0, 0.38, 0], null, [1.05, 0.75, 0.6], hex(p.skin), { name: 'chest' });
    r.mesh('torso', 'box', [0, 0.45, 0.03], [0, 0, 0.6], [0.12, 1.0, 0.64], leather);
    for (const s of ['L', 'R']) r.mesh('sh' + s, 'sphere', [0, 0.1, 0], null, [0.62, 0.48, 0.62], hex(0x8a6a4a));
    r.mesh('head', 'box', [0, 0.18, 0.18], null, [0.4, 0.26, 0.2], hex(0x5a3a22));
    r.mesh('head', 'sphere', [0, 0.4, 0], null, [0.56, 0.36, 0.56], steelDark);
    for (const sx of [1, -1]) r.mesh('head', 'cone', [0.32 * sx, 0.62, 0], [0, 0, -0.9 * sx], [0.18, 0.62, 0.18], bone);
    r.joint('wpn', 'haR', [0, -0.06, 0.06]);
    r.mesh('wpn', 'cyl', [0, 0, 0.5], [PI / 2, 0, 0], [0.1, 1.9, 0.1], wood);
    r.mesh('wpn', 'blade', [0.0, 0.32, 1.25], [0, 0, 0], [0.75, 0.75, 1.4], steel, { name: 'axeHead' });
    r.mesh('wpn', 'blade', [0.0, -0.32, 1.25], [PI, 0, 0], [0.75, 0.75, 1.4], steel);
    return { rig: r, style: 'axe', scale: 1.14 };
  },
  sylva(p) {
    const r = base(p, { build: 0.9, sleeve: hex(p.primary), glove: leather, boots: leather, pants: hex(0x3a5a3a), eyeColor: hex(0x3a6a2a) });
    r.mesh('head', 'sphere', [0, 0.38, -0.08], null, [0.56, 0.48, 0.56], hex(0xe0c070));
    r.mesh('head', 'box', [0, 0.1, -0.3], [0.2, 0, 0], [0.22, 0.6, 0.12], hex(0xe0c070));
    for (const sx of [1, -1]) r.mesh('head', 'cone', [0.27 * sx, 0.36, -0.05], [0, 0, -1.3 * sx], [0.08, 0.3, 0.08], hex(p.skin));
    r.mesh('head', 'cone', [0, 0.72, -0.05], [-0.3, 0, 0], [0.5, 0.35, 0.5], hex(p.primary));
    r.mesh('torso', 'box', [0, 0.4, 0.02], null, [0.76, 0.56, 0.48], hex(p.primary));
    r.mesh('torso', 'box', [0, 0.38, 0.24], [0, 0, 0.7], [0.08, 0.8, 0.04], leather);
    r.joint('quiver', 'torso', [0.2, 0.5, -0.3], [0.3, 0, -0.3]);
    r.mesh('quiver', 'cyl', [0, 0, 0], null, [0.24, 0.8, 0.24], leather);
    for (let i = 0; i < 3; i++) r.mesh('quiver', 'cone', [(i - 1) * 0.07, 0.5, 0], null, [0.08, 0.2, 0.08], hex(p.accent), { e: 0.4 });
    r.joint('bow', 'haL', [0, -0.08, 0.05], [0, 0, 0]);
    r.mesh('bow', 'box', [0, 0.45, 0.12], [-0.35, 0, 0], [0.07, 0.95, 0.07], wood);
    r.mesh('bow', 'box', [0, -0.45, 0.12], [0.35, 0, 0], [0.07, 0.95, 0.07], wood);
    r.mesh('bow', 'box', [0, 0, -0.04], null, [0.02, 1.75, 0.02], hex(0xf0f0e0), { outline: false, name: 'string' });
    r.mesh('bow', 'octa', [0, 0, 0.2], null, [0.12, 0.2, 0.12], hex(p.accent), { e: 1 });
    return { rig: r, style: 'bow', scale: 0.98 };
  },
  mordrin(p) {
    const r = base(p, { build: 1.0, sleeve: hex(p.primary), forearm: bone, glove: bone, boots: black, eyeColor: hex(p.accent), eyeGlow: 2.5, skin: hex(p.skin) });
    r.mesh('head', 'box', [0, 0.14, 0.12], null, [0.36, 0.18, 0.3], bone);
    r.mesh('head', 'torus', [0, 0.58, 0], null, [0.62, 0.8, 0.62], gold);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      r.mesh('head', 'cone', [Math.sin(a) * 0.28, 0.72, Math.cos(a) * 0.28], null, [0.09, 0.25, 0.09], gold);
    }
    r.mesh('hips', 'cone', [0, -0.42, 0], null, [1.05, 1.1, 0.9], hex(p.primary), { name: 'robe' });
    r.joint('cape', 'torso', [0, 0.7, -0.24]);
    r.mesh('cape', 'box', [0, -0.75, -0.03], null, [0.95, 1.5, 0.05], hex(p.dark), { name: 'capeMesh' });
    for (const s of ['L', 'R']) r.mesh('sh' + s, 'sphere', [0, 0.06, 0], null, [0.4, 0.3, 0.4], bone);
    r.joint('wpn', 'haR', [0, -0.05, 0.05]);
    r.mesh('wpn', 'cyl', [0, 0.35, 0], null, [0.08, 2.4, 0.08], hex(0x3a3030));
    r.mesh('wpn', 'blade', [0.0, 1.5, -0.05], [0, PI / 2, -PI / 2 - 0.3], [0.35, 1.2, 1], hex(0x9fffd0), { e: 0.7, glow: true });
    r.mesh('wpn', 'gem', [0, 1.55, 0], null, [0.22, 0.22, 0.22], hex(p.accent), { e: 2, name: 'orb', glow: true });
    return { rig: r, style: 'scythe', scale: 1.04, tip: 'orb', aura: 'souls' };
  },
  aurelia(p) {
    const r = base(p, { build: 0.92, sleeve: hex(p.primary), glove: hex(p.skin), boots: hex(p.secondary), eyeColor: hex(0x6a4a20) });
    r.mesh('head', 'sphere', [0, 0.3, -0.12], null, [0.6, 0.62, 0.56], hex(0x2a1a10));
    r.mesh('head', 'box', [0, -0.1, -0.24], null, [0.5, 0.7, 0.14], hex(0x2a1a10));
    r.mesh('head', 'torus', [0, 0.95, -0.1], [0.25, 0, 0], [0.75, 0.75, 0.75], hex(p.accent), { e: 2.2, name: 'halo', outline: false, glow: true });
    r.mesh('hips', 'cone', [0, -0.42, 0], null, [1.0, 1.05, 0.85], hex(p.primary), { name: 'robe' });
    r.mesh('torso', 'box', [0, 0.38, 0.03], null, [0.78, 0.15, 0.48], hex(p.secondary));
    for (const sx of [1, -1]) {
      r.joint('wing' + (sx > 0 ? 'L' : 'R'), 'torso', [0.15 * sx, 0.55, -0.26], [0.2, 0.5 * sx, 0.9 * sx]);
      r.mesh('wing' + (sx > 0 ? 'L' : 'R'), 'blade', [0, 0, 0], [0, 0, 0], [0.42, 1.3, 1], hex(0xfff6d8), { e: 0.8, alpha: 0.85, glow: true });
    }
    r.joint('wpn', 'haR', [0, -0.05, 0.05]);
    r.mesh('wpn', 'cyl', [0, 0.3, 0], null, [0.07, 2.0, 0.07], gold);
    r.mesh('wpn', 'torus', [0, 1.38, 0], [PI / 2, 0, 0], [0.55, 0.55, 0.55], gold, { e: 0.6 });
    r.mesh('wpn', 'sphere', [0, 1.38, 0], null, [0.3, 0.3, 0.3], hex(p.accent), { e: 2.2, name: 'orb', glow: true });
    return { rig: r, style: 'staff', scale: 1, tip: 'orb', aura: 'holy' };
  },
  zephyr(p) {
    const r = base(p, { build: 0.98, sleeve: hex(p.primary), forearm: hex(p.secondary), glove: hex(p.dark), boots: hex(p.dark), pants: hex(p.dark) });
    r.mesh('head', 'sphere', [0, 0.38, -0.05], null, [0.55, 0.45, 0.56], black);
    r.mesh('head', 'sphere', [0, 0.65, -0.2], null, [0.22, 0.22, 0.22], black);
    r.mesh('head', 'box', [0, 0.42, 0.06], null, [0.58, 0.07, 0.5], hex(p.secondary));
    r.mesh('torso', 'box', [0, 0.4, 0.02], [0, 0, 0.35], [0.12, 0.85, 0.5], hex(p.secondary));
    r.joint('scarf', 'torso', [0, 0.7, -0.15]);
    r.mesh('scarf', 'box', [0, -0.1, -0.5], [1.1, 0, 0], [0.3, 1.0, 0.04], hex(p.accent), { name: 'scarfMesh', e: 0.25 });
    r.joint('sheath', 'hips', [0.36, 0, 0.1], [0.4, 0, 0.3]);
    r.mesh('sheath', 'box', [0, 0, -0.3], null, [0.1, 0.12, 1.0], black);
    r.joint('wpn', 'haR', [0, -0.06, 0.05]);
    r.mesh('wpn', 'cyl', [0, 0, 0], [PI / 2, 0, 0], [0.06, 0.38, 0.06], hex(p.dark));
    r.mesh('wpn', 'cyl', [0, 0, 0.2], [PI / 2, 0, 0], [0.2, 0.03, 0.2], gold);
    r.mesh('wpn', 'blade', [0, 0, 0.22], [PI / 2, 0, 0], [0.09, 1.55, 1], hex(0xe8fbff), { e: 0.35, name: 'blade', glow: true });
    return { rig: r, style: 'katana', scale: 1, aura: 'wind' };
  },
  ignis(p) {
    const r = base(p, { build: 1.0, sleeve: hex(p.dark), forearm: hex(p.skin), glove: hex(p.secondary), boots: black, pants: black, eyeColor: hex(p.accent), eyeGlow: 2.5 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      r.mesh('head', 'cone', [Math.sin(a) * 0.14, 0.62 + (i % 2) * 0.08, Math.cos(a) * 0.14 - 0.08], [-0.3 + Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [0.24, 0.6, 0.24], i % 2 ? hex(p.secondary) : hex(p.accent), { e: 1.5, outline: false, glow: true });
    }
    r.mesh('torso', 'box', [0, 0.36, 0.23], null, [0.4, 0.06, 0.02], hex(p.accent), { e: 2, outline: false });
    r.mesh('torso', 'box', [0, 0.52, 0.23], null, [0.25, 0.05, 0.02], hex(p.accent), { e: 2, outline: false });
    for (const s of ['L', 'R']) {
      r.mesh('sh' + s, 'sphere', [0, 0.06, 0], null, [0.42, 0.34, 0.42], hex(p.dark));
      r.joint('orb' + s, 'ha' + s, [0, -0.25, 0.08]);
      r.mesh('orb' + s, 'sphere', [0, 0, 0], null, [0.36, 0.36, 0.36], hex(p.secondary), { e: 2.4, outline: false, name: 'orb' + s, glow: true });
    }
    return { rig: r, style: 'orbs', scale: 1, tip: 'orbR', aura: 'embers' };
  },
  rime(p) {
    const r = base(p, { build: 1.25, sleeve: hex(p.primary), forearm: hex(p.secondary), glove: hex(p.dark), boots: hex(p.dark), pants: hex(p.dark), eyeColor: hex(0xbff6ff), eyeGlow: 2 });
    r.mesh('torso', 'box', [0, 0.4, 0], null, [0.98, 0.7, 0.58], hex(p.primary));
    r.mesh('torso', 'octa', [0, 0.42, 0.28], null, [0.3, 0.42, 0.2], hex(p.accent), { e: 1.4, glow: true });
    for (const s of ['L', 'R']) {
      r.mesh('sh' + s, 'octa', [0, 0.25, 0], [0, 0.4, s === 'L' ? -0.4 : 0.4], [0.5, 0.8, 0.5], hex(p.accent), { e: 0.6 });
      r.mesh('sh' + s, 'octa', [0, 0.1, 0.12], [0, 0, s === 'L' ? -0.9 : 0.9], [0.25, 0.55, 0.25], hex(p.secondary), { e: 0.4 });
    }
    for (let i = 0; i < 5; i++) {
      const a = ((i - 2) / 4) * 1.6;
      r.mesh('head', 'octa', [Math.sin(a) * 0.25, 0.68, Math.cos(a) * 0.1 - 0.05], [0, 0, -a * 0.5], [0.12, 0.5 - Math.abs(i - 2) * 0.1, 0.12], hex(p.accent), { e: 0.9, glow: true });
    }
    r.joint('wpn', 'haR', [0, -0.06, 0.05]);
    r.mesh('wpn', 'cyl', [0, 0, 0.35], [PI / 2, 0, 0], [0.09, 1.3, 0.09], hex(p.dark));
    r.mesh('wpn', 'octa', [0, 0, 1.15], [0, 0, PI / 4], [0.7, 0.7, 0.9], hex(p.accent), { e: 0.9, name: 'maceHead', glow: true });
    return { rig: r, style: 'mace', scale: 1.12, aura: 'snow' };
  },
};

export function buildHeroModel(def) {
  const out = BUILDERS[def.id](def.palette);
  out.def = def;
  return out;
}

// ---------------------------------------------------------------- animation
// st: { t, speed (0..1), phase, atk (0..1|-1), atkN, cast (0..1|-1), slot, dash, air (0..1|-1), stun, dead (0..1|-1), recall, channel }
export function animateHero(model, st) {
  const r = model.rig;
  const J = r.j;
  r.reset();
  const t = st.t;
  const sp = st.speed;
  const ph = st.phase;
  const style = model.style;

  // ----- locomotion / idle
  const breathe = Math.sin(t * 2.2) * 0.03;
  J.torso.rot[0] += breathe + sp * 0.18;
  J.hips.pos[1] += Math.abs(Math.sin(ph)) * 0.09 * sp - (1 - sp) * 0.02;
  for (const [s, sign] of [['L', 1], ['R', -1]]) {
    const leg = Math.sin(ph) * sign;
    J['lg' + s].rot[0] += -leg * 0.85 * sp;
    J['kn' + s].rot[0] += Math.max(0, Math.sin(ph + (sign > 0 ? PI / 2 : -PI / 2))) * 1.1 * sp + 0.05;
    J['sh' + s].rot[0] += leg * 0.65 * sp + Math.sin(t * 2.2 + sign) * 0.03;
    J['el' + s].rot[0] -= 0.25 + sp * 0.35;
    J['sh' + s].rot[2] += sign * (0.08 + (1 - sp) * 0.05);
  }
  J.hips.rot[1] += Math.sin(ph) * 0.12 * sp;
  J.torso.rot[1] -= Math.sin(ph) * 0.18 * sp;
  // weapon idle carriage
  if (style === 'staff' || style === 'scythe') { J.shR.rot[0] -= 0.25; J.elR.rot[0] -= 0.5; }
  if (style === 'bow') { J.shL.rot[0] -= 0.25; J.elL.rot[0] -= 0.4; }
  if (style === 'orbs') { J.shL.rot[0] -= 0.4; J.shR.rot[0] -= 0.4; J.elL.rot[0] -= 0.6; J.elR.rot[0] -= 0.6; }
  if (style === 'axe') { J.shR.rot[0] -= 0.3; J.elR.rot[0] -= 0.7; J.shL.rot[0] -= 0.5; J.elL.rot[0] -= 0.9; J.shL.rot[2] -= 0.35; }

  // cloth secondary motion
  if (J.cape) J.cape.rot[0] += 0.12 + sp * 0.55 + Math.sin(t * 3 + 1) * 0.05;
  if (J.scarf) { J.scarf.rot[0] += 0.3 + sp * 0.5 + Math.sin(t * 5) * 0.1; J.scarf.rot[2] += Math.sin(t * 3.7) * 0.15; }
  if (J.wingL) { J.wingL.rot[2] += Math.sin(t * 2.5) * 0.12; J.wingR.rot[2] -= Math.sin(t * 2.5) * 0.12; }
  if (r.m.halo) { r.m.halo.rot[1] = t * 1.2; r.m.halo.pos[1] += Math.sin(t * 2) * 0.03; }
  if (J.orbL) { J.orbL.pos[1] += Math.sin(t * 4) * 0.05; J.orbR.pos[1] += Math.cos(t * 4) * 0.05; }

  // ----- dash
  if (st.dash) {
    J.torso.rot[0] += 0.55;
    J.lgL.rot[0] += 0.6; J.lgR.rot[0] -= 0.3;
    J.knL.rot[0] += 0.9; J.knR.rot[0] += 0.6;
    J.shL.rot[0] += 0.9; J.shR.rot[0] += 0.9;
  }

  // ----- basic attack
  if (st.atk >= 0) {
    const a = st.atk;
    const wind = Math.min(1, a / 0.5);
    const rel = a < 0.5 ? 0 : Math.min(1, (a - 0.5) / 0.5);
    const swing = a < 0.5 ? easeOut(wind) : 1 - easeIn(rel) * 0.0;
    const alt = st.atkN % 2 ? -1 : 1;
    switch (style) {
      case 'sword': case 'katana': case 'mace': {
        const up = a < 0.5 ? easeOut(wind) : 1 - easeOut(rel);
        J.shR.rot[0] += -2.4 * up + (a >= 0.5 ? -0.9 * Math.sin(rel * PI) : 0);
        J.shR.rot[2] += (0.6 * up - 0.7 * (a >= 0.5 ? Math.sin(rel * PI) : 0)) * alt;
        J.elR.rot[0] += -0.6 * up;
        J.torso.rot[1] += (0.5 * up - 0.7 * (a >= 0.5 ? Math.sin(rel * PI * 0.5) : 0)) * alt;
        J.torso.rot[0] += a >= 0.5 ? 0.2 * Math.sin(rel * PI) : 0;
        break;
      }
      case 'axe': {
        const up = a < 0.5 ? easeOut(wind) : 1 - easeOut(rel);
        for (const s of ['L', 'R']) { J['sh' + s].rot[0] += -2.8 * up - (a >= 0.5 ? 0.5 * Math.sin(rel * PI) : 0); }
        J.torso.rot[0] += -0.35 * up + (a >= 0.5 ? 0.45 * Math.sin(rel * PI) : 0);
        break;
      }
      case 'daggers': {
        const s = alt > 0 ? 'R' : 'L';
        const k = a < 0.5 ? -0.4 * wind : -1.7 * Math.sin(rel * PI) - 0.4 * (1 - rel);
        J['sh' + s].rot[0] += k;
        J['el' + s].rot[0] += a < 0.5 ? -1.2 * wind : -0.2;
        J.torso.rot[1] += 0.35 * alt * (a < 0.5 ? wind : 1 - rel);
        break;
      }
      case 'staff': case 'scythe': {
        const k = a < 0.5 ? wind : 1 - rel;
        J.shR.rot[0] += -1.3 * k - (a >= 0.5 ? 0.4 * Math.sin(rel * PI) : 0);
        J.elR.rot[0] += 0.3 * k;
        if (style === 'scythe') J.torso.rot[1] += (a < 0.5 ? 0.7 * wind : 0.7 - 1.5 * easeOut(rel));
        break;
      }
      case 'bow': {
        const k = a < 0.5 ? easeOut(wind) : 1 - rel;
        J.shL.rot[0] += -1.4 * k; J.elL.rot[0] += 0.4 * k;
        J.shR.rot[0] += -1.45 * k; J.elR.rot[0] += -1.6 * k; J.shR.rot[2] += 0.2 * k;
        J.torso.rot[1] += 0.6 * k;
        if (r.m.string) r.m.string.pos[2] = -0.04 - 0.35 * (a < 0.5 ? wind : 0);
        break;
      }
      case 'orbs': {
        const k = a < 0.5 ? wind : 1 - rel;
        const s = alt > 0 ? 'R' : 'L';
        J['sh' + s].rot[0] += -1.2 * k;
        J['el' + s].rot[0] += 0.5 * k;
        break;
      }
    }
    void swing;
  }

  // ----- ability cast
  if (st.cast >= 0) {
    const c = st.cast;
    const k = c < 0.35 ? easeOut(c / 0.35) : 1 - easeIn((c - 0.35) / 0.65);
    if (st.slot === 'r') {
      J.shL.rot[0] += -2.7 * k; J.shR.rot[0] += -2.7 * k;
      J.shL.rot[2] += 0.5 * k; J.shR.rot[2] -= 0.5 * k;
      J.torso.rot[0] += -0.25 * k;
      J.hips.pos[1] += 0.15 * k;
    } else if (style === 'sword' || style === 'katana' || style === 'axe' || style === 'mace' || style === 'daggers') {
      J.shR.rot[0] += -1.9 * k; J.shR.rot[2] += -0.6 * k; J.torso.rot[1] += -0.7 * k;
      J.shL.rot[0] += -0.8 * k;
    } else {
      J.shR.rot[0] += -1.7 * k; J.shL.rot[0] += -1.2 * k; J.elR.rot[0] += 0.3 * k;
      J.torso.rot[0] += 0.12 * k;
    }
  }
  if (st.channel) {
    J.shL.rot[0] += -2.6; J.shR.rot[0] += -2.6; J.shL.rot[2] += 0.7; J.shR.rot[2] -= 0.7;
    J.hips.rot[1] += t * 6;
  }
  if (st.recall) {
    J.shL.rot[2] += 1.2; J.shR.rot[2] -= 1.2; J.shL.rot[0] -= 0.4; J.shR.rot[0] -= 0.4;
    J.hips.pos[1] -= 0.05;
    J.head.rot[0] -= 0.3;
  }
  if (st.stun) {
    J.head.rot[2] += Math.sin(t * 9) * 0.25;
    J.torso.rot[0] -= 0.15;
    J.shL.rot[0] += 0.3; J.shR.rot[0] += 0.3;
  }
  if (st.rage && r.m.chest) { /* scale handled at root */ }
  // ----- death
  if (st.dead >= 0) {
    const d = easeOut(Math.min(1, st.dead / 0.7));
    J.root.rot[0] -= 1.45 * d;
    J.root.pos[1] -= 0.0;
    J.shL.rot[2] += 1.0 * d; J.shR.rot[2] -= 1.0 * d;
    J.knL.rot[0] += 0.4 * d;
  }
}

function easeOut(x) { return 1 - (1 - x) * (1 - x); }
function easeIn(x) { return x * x; }
