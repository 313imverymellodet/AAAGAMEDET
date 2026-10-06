export const ITEMS = [
  // Basic
  { id: 'blade', name: 'Steel Blade', cost: 400, tier: 1, icon: '⚔', stats: { ad: 18 }, desc: '+18 Attack Damage' },
  { id: 'tome', name: 'Arcane Tome', cost: 400, tier: 1, icon: '📘', stats: { ap: 28 }, desc: '+28 Ability Power' },
  { id: 'plate', name: 'Iron Plate', cost: 400, tier: 1, icon: '🛡', stats: { armor: 22 }, desc: '+22 Armor' },
  { id: 'cloak', name: 'Null Cloak', cost: 400, tier: 1, icon: '🧥', stats: { mr: 22 }, desc: '+22 Magic Resist' },
  { id: 'gem', name: 'Vital Gem', cost: 400, tier: 1, icon: '💎', stats: { hp: 180 }, desc: '+180 Health' },
  { id: 'boots', name: 'Swift Boots', cost: 350, tier: 1, icon: '👢', stats: { speedPct: 0.12 }, desc: '+12% Move Speed', unique: true },
  // Advanced
  { id: 'reaver', name: "Reaver's Edge", cost: 1300, tier: 2, icon: '🩸', stats: { ad: 40, lifesteal: 0.12 }, desc: '+40 AD, +12% Lifesteal' },
  { id: 'quickbow', name: 'Quickstrike Bow', cost: 1300, tier: 2, icon: '🏹', stats: { ad: 25, as: 0.4 }, desc: '+25 AD, +40% Attack Speed' },
  { id: 'executioner', name: "Executioner's Fang", cost: 1500, tier: 2, icon: '🗡', stats: { ad: 50, armorPen: 0.25 }, desc: '+50 AD, +25% Armor Pen' },
  { id: 'warhammer', name: "Warlord's Hammer", cost: 1400, tier: 2, icon: '🔨', stats: { ad: 30, hp: 300, cdr: 0.1 }, desc: '+30 AD, +300 HP, +10% Haste' },
  { id: 'storm', name: 'Stormcaller Staff', cost: 1350, tier: 2, icon: '⚡', stats: { ap: 70, cdr: 0.15 }, desc: '+70 AP, +15% Ability Haste' },
  { id: 'voidprism', name: 'Void Prism', cost: 1500, tier: 2, icon: '🔮', stats: { ap: 60, magicPen: 0.3 }, desc: '+60 AP, +30% Magic Pen' },
  { id: 'soulfont', name: 'Soulfont Orb', cost: 1300, tier: 2, icon: '✨', stats: { ap: 50, hp: 200, healPower: 0.2 }, desc: '+50 AP, +200 HP, +20% Heal & Shield Power' },
  { id: 'titan', name: "Titan's Heart", cost: 1450, tier: 2, icon: '❤', stats: { hp: 450, armor: 30 }, desc: '+450 HP, +30 Armor' },
  { id: 'mantle', name: 'Spellguard Mantle', cost: 1300, tier: 2, icon: '🌀', stats: { hp: 300, mr: 45 }, desc: '+300 HP, +45 Magic Resist' },
  { id: 'aegis', name: 'Aegis of Dawn', cost: 1400, tier: 2, icon: '🔆', stats: { hp: 300, armor: 20, mr: 20, cdr: 0.15 }, desc: '+300 HP, +20 Armor/MR, +15% Haste' },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const MAX_ITEMS = 6;
export const SELL_RATIO = 0.7;
