// The ten champions of Spirebreak. Pure data — ability logic lives in sim/abilities.js.
// aim: 'dir' = skillshot/line, 'point' = ground target, 'self' = around caster, 'unit' = locks the enemy in the aim cone.

export const HEROES = [
  {
    id: 'kaelen', name: 'Kaelen', title: 'The Iron Vow', role: 'Vanguard', difficulty: 1, ranged: false,
    lore: 'A knight who swore to hold the Dawn Spire until the last stone falls.',
    palette: { primary: 0x5b7fb8, secondary: 0xd8b25a, skin: 0xe2b897, accent: 0x9fd0ff, dark: 0x2a3a58 },
    stats: { hp: 700, hpG: 105, armor: 36, armorG: 4.2, mr: 32, mrG: 1.8, ad: 60, adG: 3.4, as: 0.68, asG: 0.018, range: 3.1, speed: 7.6, regen: 7 },
    q: { name: 'Shield Rush', desc: 'Charge forward with your shield. The first enemy struck takes physical damage and is stunned.', cd: 9, aim: 'dir', range: 8.5, width: 1.8, base: 60, lvl: 32, ad: 0.7, stun: 1.0 },
    e: { name: 'Bulwark', desc: 'Raise your shield: gain a shield that scales with max HP and slow nearby enemies.', cd: 12, aim: 'self', radius: 5.5, base: 80, lvl: 30, hpPct: 0.08, dur: 3, slow: 0.35 },
    r: { name: 'Judgement Leap', desc: 'Leap to a location. On landing, deal physical damage around you and knock enemies airborne.', cd: 58, aim: 'point', range: 13, radius: 5.5, base: 150, lvl: 60, ad: 0.9, knock: 1.0 },
    passive: 'Oathbound — Kaelen takes 8% less damage while near an allied structure.',
    build: ['boots', 'titan', 'mantle', 'warhammer', 'aegis', 'reaver'],
  },
  {
    id: 'lyra', name: 'Lyra', title: 'Starweaver', role: 'Mage', difficulty: 2, ranged: true,
    lore: 'An astronomer who learned to pull constellations out of the night sky.',
    palette: { primary: 0x6b3fb8, secondary: 0x56e0ff, skin: 0xf0cdb4, accent: 0xb59bff, dark: 0x251542 },
    stats: { hp: 590, hpG: 92, armor: 25, armorG: 3.6, mr: 30, mrG: 1, ad: 52, adG: 2.9, as: 0.66, asG: 0.016, range: 10.5, speed: 7.5, regen: 5 },
    atk: { speed: 40, vis: 'arcane' },
    q: { name: 'Arcane Bolt', desc: 'Fire a bolt of starlight that deals magic damage to the first enemy hit.', cd: 4.5, aim: 'dir', range: 15, width: 1.3, speed: 38, base: 92, lvl: 42, ap: 0.75 },
    e: { name: 'Blink', desc: 'Teleport a short distance, leaving behind a burst of stardust that damages enemies.', cd: 11, aim: 'dir', range: 8, radius: 3.2, base: 45, lvl: 20, ap: 0.35 },
    r: { name: 'Starfall', desc: 'Call down a star at a location. After a short delay it deals massive magic damage and slows.', cd: 52, aim: 'point', range: 19, radius: 6, delay: 0.85, base: 240, lvl: 95, ap: 1.0, slow: 0.4 },
    passive: 'Constellation — every 4th ability cast refunds 20% of Starfall\'s remaining cooldown.',
    build: ['boots', 'storm', 'voidprism', 'soulfont', 'mantle', 'tome'],
  },
  {
    id: 'vex', name: 'Vex', title: 'The Umbral Edge', role: 'Assassin', difficulty: 3, ranged: false,
    lore: 'A blade-for-hire who walks between shadows — and sometimes forgets to come back.',
    palette: { primary: 0x2b2233, secondary: 0xd2304a, skin: 0xbfa2b8, accent: 0xff4a6e, dark: 0x120c18 },
    stats: { hp: 615, hpG: 95, armor: 29, armorG: 3.7, mr: 30, mrG: 1.2, ad: 66, adG: 3.8, as: 0.72, asG: 0.022, range: 3.0, speed: 8.0, regen: 6 },
    q: { name: 'Shadow Strike', desc: 'Dash through enemies, slashing everything in your path. Resets on champion takedown.', cd: 7, aim: 'dir', range: 7.5, width: 2, base: 80, lvl: 36, ad: 0.85 },
    e: { name: 'Veil', desc: 'Vanish into stealth and gain move speed. Your next attack from stealth deals bonus damage.', cd: 16, aim: 'self', dur: 3, haste: 0.3, base: 60, lvl: 26, ad: 0.5 },
    r: { name: 'Death Mark', desc: 'Blink behind the enemy champion in your sights and strike for damage that grows with their missing HP.', cd: 48, aim: 'unit', range: 11, base: 150, lvl: 70, ad: 1.0, missing: 0.25 },
    passive: 'Predator — Vex deals 10% bonus damage to champions below 40% HP.',
    build: ['boots', 'executioner', 'reaver', 'quickbow', 'warhammer', 'mantle'],
  },
  {
    id: 'brakka', name: 'Brakka', title: "The Mountain's Wrath", role: 'Juggernaut', difficulty: 1, ranged: false,
    lore: 'A highland chieftain whose axe was carved from a fallen mountain.',
    palette: { primary: 0x7a4a2a, secondary: 0xe0782a, skin: 0x9a7058, accent: 0xffb050, dark: 0x3a2214 },
    stats: { hp: 720, hpG: 108, armor: 33, armorG: 4, mr: 32, mrG: 1.6, ad: 64, adG: 3.9, as: 0.65, asG: 0.02, range: 3.3, speed: 7.5, regen: 8 },
    q: { name: 'Cleave', desc: 'Spin your axe, dealing physical damage around you. Heal for each champion hit.', cd: 6, aim: 'self', radius: 4.8, base: 66, lvl: 32, ad: 0.85, healMissing: 0.06 },
    e: { name: 'Earthsplitter', desc: 'Slam the ground, sending a fissure forward that damages and slows.', cd: 10, aim: 'dir', range: 9, width: 3.6, base: 60, lvl: 30, ad: 0.6, slow: 0.45 },
    r: { name: 'Unstoppable', desc: 'Cleanse all crowd control and become a raging giant: bonus attack speed, move speed and damage reduction.', cd: 60, aim: 'self', dur: 8, as: 0.4, haste: 0.15, dr: 0.2 },
    passive: 'Bloodrush — basic attacks heal for 4% of damage dealt (doubled while Unstoppable).',
    build: ['boots', 'warhammer', 'titan', 'reaver', 'mantle', 'aegis'],
  },
  {
    id: 'sylva', name: 'Sylva', title: 'The Thornwind', role: 'Marksman', difficulty: 2, ranged: true,
    lore: 'The last ranger of the Thornwood. Her arrows are grown, not fletched.',
    palette: { primary: 0x3f8a4a, secondary: 0xe8dcb0, skin: 0xd9a97e, accent: 0x9cff7a, dark: 0x1d3a22 },
    stats: { hp: 560, hpG: 86, armor: 24, armorG: 3.4, mr: 30, mrG: 1, ad: 60, adG: 3.4, as: 0.72, asG: 0.028, range: 11.5, speed: 7.6, regen: 5 },
    atk: { speed: 48, vis: 'arrow' },
    q: { name: 'Piercing Arrow', desc: 'Loose an arrow that pierces through every enemy in a line.', cd: 6, aim: 'dir', range: 17, width: 1.1, speed: 52, base: 60, lvl: 30, ad: 1.0 },
    e: { name: 'Tumble Volley', desc: 'Vault backward while firing a fan of arrows in your aim direction.', cd: 9, aim: 'dir', range: 11, arrows: 5, spread: 0.9, back: 5, base: 30, lvl: 16, ad: 0.55 },
    r: { name: "Hunter's Mark", desc: 'Fire a colossal arrow across the map. Stuns the first champion hit — longer the farther it flew.', cd: 70, aim: 'dir', range: 70, width: 1.8, speed: 46, base: 180, lvl: 72, ad: 0.9 },
    passive: 'Windrunner — after using an ability, gain 20% move speed for 1.5s.',
    build: ['boots', 'quickbow', 'executioner', 'reaver', 'mantle', 'blade'],
  },
  {
    id: 'mordrin', name: 'Mordrin', title: 'The Hollow King', role: 'Necromancer', difficulty: 2, ranged: true,
    lore: 'A king who refused to stay buried, and a kingdom that followed him back.',
    palette: { primary: 0x2f4a3a, secondary: 0xd9d2b8, skin: 0x9fb3a6, accent: 0x6dffb5, dark: 0x14231b },
    stats: { hp: 580, hpG: 92, armor: 25, armorG: 3.6, mr: 32, mrG: 1.3, ad: 52, adG: 2.9, as: 0.64, asG: 0.015, range: 9.5, speed: 7.4, regen: 5 },
    atk: { speed: 34, vis: 'soul' },
    q: { name: 'Bone Spear', desc: 'Hurl a spear of bone that damages and roots the first enemy hit.', cd: 9, aim: 'dir', range: 14, width: 1.3, speed: 32, base: 70, lvl: 36, ap: 0.6, root: 1.2 },
    e: { name: 'Soul Mire', desc: 'Curse the ground: enemies inside take magic damage over time and are slowed.', cd: 11, aim: 'point', range: 13, radius: 4.8, dur: 3, base: 22, lvl: 11, ap: 0.14, slow: 0.35 },
    r: { name: 'Army of the Fallen', desc: 'Raise three wraiths that hunt down nearby enemies for 12 seconds.', cd: 60, aim: 'point', range: 9, radius: 3, count: 3, dur: 12, base: 28, lvl: 11, ap: 0.22 },
    passive: 'Soul Harvest — nearby enemy deaths heal Mordrin for 2% max HP.',
    build: ['boots', 'voidprism', 'storm', 'titan', 'mantle', 'tome'],
  },
  {
    id: 'aurelia', name: 'Aurelia', title: 'Lightbringer', role: 'Support', difficulty: 1, ranged: true,
    lore: 'A sun-priestess whose halo has never once dimmed — not even in the Dusk.',
    palette: { primary: 0xf2ede0, secondary: 0xf2c14a, skin: 0xc68a63, accent: 0xfff2a0, dark: 0x6b5a2a },
    stats: { hp: 570, hpG: 90, armor: 26, armorG: 3.6, mr: 32, mrG: 1.3, ad: 48, adG: 2.6, as: 0.64, asG: 0.014, range: 9.5, speed: 7.5, regen: 6 },
    atk: { speed: 36, vis: 'holy' },
    q: { name: 'Radiant Lance', desc: 'Throw a lance of light that damages the first enemy, then heals the most wounded nearby ally.', cd: 6, aim: 'dir', range: 14, width: 1.2, speed: 38, base: 60, lvl: 30, ap: 0.5, heal: 40, healLvl: 24, healAp: 0.4 },
    e: { name: 'Sanctuary', desc: 'Consecrate an area, healing allies and slowing enemies inside.', cd: 13, aim: 'point', range: 11, radius: 5.2, dur: 3, heal: 16, healLvl: 8, healAp: 0.1, slow: 0.25 },
    r: { name: 'Dawnshield', desc: 'Cleanse and shield every allied champion nearby.', cd: 68, aim: 'self', radius: 26, base: 150, lvl: 60, ap: 0.6, dur: 4 },
    passive: 'Grace — healing an ally also grants them 15% move speed for 1.5s.',
    build: ['boots', 'soulfont', 'aegis', 'storm', 'mantle', 'titan'],
  },
  {
    id: 'zephyr', name: 'Zephyr', title: 'The Gale Blade', role: 'Skirmisher', difficulty: 3, ranged: false,
    lore: 'A wandering swordsman who claims the wind owes him a debt.',
    palette: { primary: 0x2f8f9a, secondary: 0xf0f4f4, skin: 0xe6c2a0, accent: 0x9ffff0, dark: 0x153a40 },
    stats: { hp: 600, hpG: 94, armor: 28, armorG: 3.8, mr: 30, mrG: 1.3, ad: 62, adG: 3.5, as: 0.7, asG: 0.028, range: 3.2, speed: 7.9, regen: 6 },
    q: { name: 'Gale Slash', desc: 'Thrust forward. Landing two slashes empowers the third into a tornado that knocks enemies airborne.', cd: 3.5, aim: 'dir', range: 5.8, width: 1.8, base: 45, lvl: 26, ad: 0.9, tornadoRange: 13, knock: 1.0 },
    e: { name: 'Wind Step', desc: 'Dash in your aim direction, cutting enemies you pass through.', cd: 6, aim: 'dir', range: 7, width: 2, base: 40, lvl: 20, ad: 0.5 },
    r: { name: 'Tempest', desc: 'Summon a cyclone that pulls all nearby enemies to you and knocks them airborne.', cd: 55, aim: 'self', radius: 7.5, base: 160, lvl: 70, ad: 1.0, knock: 0.9 },
    passive: 'Way of the Wind — Zephyr gains a 1.2s 20% move-speed burst after each dash.',
    build: ['boots', 'quickbow', 'reaver', 'executioner', 'mantle', 'titan'],
  },
  {
    id: 'ignis', name: 'Ignis', title: 'The Ember Heart', role: 'Pyromancer', difficulty: 2, ranged: true,
    lore: 'A volcano spirit bound to a mortal body. It is not a comfortable fit.',
    palette: { primary: 0xb8321e, secondary: 0xffa630, skin: 0x8a5040, accent: 0xffd060, dark: 0x401008 },
    stats: { hp: 560, hpG: 88, armor: 22, armorG: 3.4, mr: 30, mrG: 1, ad: 50, adG: 2.8, as: 0.66, asG: 0.016, range: 10, speed: 7.5, regen: 5 },
    atk: { speed: 38, vis: 'ember' },
    q: { name: 'Fireball', desc: 'Launch a fireball that explodes on impact, damaging and burning all enemies in the blast.', cd: 5, aim: 'dir', range: 15, radius: 3.6, width: 1.2, speed: 30, base: 80, lvl: 38, ap: 0.7, burn: 12, burnLvl: 5, burnDur: 3 },
    e: { name: 'Flame Wall', desc: 'Raise a line of fire in your aim direction that burns and slows enemies standing in it.', cd: 12, aim: 'dir', range: 11, width: 2.8, dur: 3, base: 20, lvl: 10, ap: 0.14, slow: 0.25 },
    r: { name: 'Inferno', desc: 'Channel a firestorm around yourself, scorching nearby enemies repeatedly. You can move while channeling.', cd: 60, aim: 'self', radius: 7.5, dur: 2.5, ticks: 6, base: 45, lvl: 20, ap: 0.25 },
    passive: 'Kindling — burning enemies take 6% more damage from Ignis.',
    build: ['boots', 'voidprism', 'storm', 'tome', 'mantle', 'titan'],
  },
  {
    id: 'rime', name: 'Rime', title: 'The Frost Warden', role: 'Warden', difficulty: 2, ranged: false,
    lore: 'A glacier given purpose. Rime remembers every winter the world has ever had.',
    palette: { primary: 0x7fc4ea, secondary: 0xf4fbff, skin: 0xa8d6f0, accent: 0xbff0ff, dark: 0x234a66 },
    stats: { hp: 680, hpG: 102, armor: 34, armorG: 4, mr: 34, mrG: 1.8, ad: 58, adG: 3.2, as: 0.64, asG: 0.016, range: 3.3, speed: 7.4, regen: 7 },
    q: { name: 'Frost Shard', desc: 'Hurl a shard of ice that deals magic damage and heavily chills the first enemy hit.', cd: 7, aim: 'dir', range: 13, width: 1.4, speed: 32, base: 70, lvl: 34, ap: 0.6, slow: 0.45 },
    e: { name: 'Glacial Armor', desc: 'Encase yourself in ice: gain a shield and chill nearby enemies while it lasts.', cd: 13, aim: 'self', radius: 4.8, dur: 4, base: 70, lvl: 28, hpPct: 0.06, slow: 0.3 },
    r: { name: 'Absolute Zero', desc: 'After a brief windup, flash-freeze everything around you, dealing magic damage and stunning.', cd: 62, aim: 'self', radius: 7.2, delay: 0.55, base: 140, lvl: 60, ap: 0.7, stun: 1.5 },
    passive: 'Permafrost — enemies chilled by Rime deal 10% less damage.',
    build: ['boots', 'titan', 'mantle', 'aegis', 'soulfont', 'warhammer'],
  },
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));
export const HERO_INDEX = Object.fromEntries(HEROES.map((h, i) => [h.id, i]));

export const ROLE_ICONS = {
  Vanguard: '🛡', Mage: '✦', Assassin: '🗡', Juggernaut: '🪓', Marksman: '🏹',
  Necromancer: '☠', Support: '✚', Skirmisher: '🌀', Pyromancer: '🔥', Warden: '❄',
};

// Scaled ability value: base + lvl*(level-1) + ad*AD + ap*AP
export function abilityValue(spec, hero, baseKey = 'base', lvlKey = 'lvl', adKey = 'ad', apKey = 'ap') {
  const lvl = hero.level || 1;
  return (spec[baseKey] || 0) + (spec[lvlKey] || 0) * (lvl - 1) + (spec[adKey] || 0) * (hero.stats?.ad || 0) + (spec[apKey] || 0) * (hero.stats?.ap || 0);
}
