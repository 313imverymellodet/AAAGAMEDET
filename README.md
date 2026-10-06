# ◆ Spirebreak

**A third-person action MOBA that runs in the browser on desktop and mobile.**
Ten original champions, 5v5 on a three-lane map, aimed skillshots and dodge rolls, smart bots, and online rooms for up to 10 players. The project has **zero dependencies**: a custom WebGL2 engine, a hand-written WebSocket server and native ES modules, with no build step.

> Original game and characters, inspired by the genre (LoL, Wild Rift, Smite). No third-party IP or assets: every model, effect, sound and song is generated procedurally in code.

## Quick start

```bash
npm start            # serves the game + multiplayer server on http://localhost:8787
npm test             # headless simulation tests (full bot matches, every ability, rules)
```

Open `http://localhost:8787`, click **Play vs AI**, pick a champion and go.
For online play, share the room's invite link (`?room=CODE`) with friends on the same server.

Requires Node ≥ 18. There's no `npm install` step because there are no dependencies.

*Offline vs AI also works from any static host* (GitHub Pages, Netlify…): the whole simulation runs in the browser. Online rooms need `npm start` running somewhere reachable (any Node host: Render, Fly.io, Railway, a VPS). Point a static build at a different server with `?server=wss://your-host/ws`.

## The game

| | |
|---|---|
| **Goal** | Push lanes with your minion waves, take towers in order (outer → inner → guardian), destroy the enemy **Spire**. |
| **Map** | *The Shattered Vale*: 3 lanes, a river, 8 jungle camps, 2 epic monsters. Point-symmetric so both sides are fair. |
| **Objectives** | **Ember Drake** gives permanent +6% damage stacks. **Ancient Warden** gives a 2-minute buff and empowers your minions. |
| **Pacing** | Built for **12–20 minute** mobile-length matches. *Siege Surge* at 12:00 empowers every wave so games end. |
| **Economy** | Last-hit gold, passive gold, kill bounties and shutdowns, assists, tower gold. 16 items with recommended builds and one-tap **Quick Buy**. |
| **Modes** | 1v1, 2v2, 3v3, 4v4 or 5v5. Bots (Easy / Normal / Hard) fill every empty slot. |

### Champions

| | Champion | Role | Kit highlights |
|---|---|---|---|
| ⚔️ | **Kaelen**, the Iron Vow | Vanguard | Shield-charge stun, max-HP shield, leap slam knock-up |
| 🌠 | **Lyra**, Starweaver | Mage | Arcane bolt, blink, delayed Starfall nuke |
| ☠️ | **Vex**, the Umbral Edge | Assassin | Resetting dash, stealth, execute that grows with missing HP |
| 😤 | **Brakka**, the Mountain's Wrath | Juggernaut | Healing cleave, fissure slow, CC-cleansing rage |
| 🎯 | **Sylva**, the Thornwind | Marksman | Piercing arrow, vault + volley, map-wide stun arrow |
| 👻 | **Mordrin**, the Hollow King | Necromancer | Rooting bone spear, soul mire, summons three wraiths |
| 🔆 | **Aurelia**, Lightbringer | Support | Damage-then-heal lance, sanctuary zone, team-wide cleanse shield |
| 🌪️ | **Zephyr**, the Gale Blade | Skirmisher | Stacking thrust into tornado, wind dash, pull-in knock-up |
| 🌋 | **Ignis**, the Ember Heart | Pyromancer | Exploding fireball with burn, flame wall, mobile inferno channel |
| 💠 | **Rime**, the Frost Warden | Warden | Chilling shard, ice armor aura, telegraphed AoE freeze |

Every champion has a passive, two basic abilities, an ultimate (unlocks at level 3) and the universal **dodge roll** with brief invulnerability.

## Controls

**Desktop.** Click to lock mouse-look. **WASD** move, **mouse** aim (third-person crosshair), **LMB** attack. **Q / E / R**: hold to show the targeter, release to cast; **RMB** cancels. **Space/Shift** dodge, **B** recall, **P** shop, **F** quick-buy, **Tab** scoreboard, **Esc** menu.

**Mobile (landscape).** Floating joystick on the left half. Drag the right half to turn the camera, which also auto-follows while you move. Hold ⚔ to auto-target attack. Abilities: **tap** to smart-cast at the best target, or **drag** to aim with a live ground indicator; release on ✕ to cancel. Add it to your home screen for fullscreen (PWA).

## Design notes: 2026–27 trends we built for

- **Third-person action combat** (Smite 2-style): aimed basic attacks and skillshots, readable red ground **telegraphs**, i-frame **dodge**, aim-assist tuned separately for mouse and touch.
- **Session length as the core constraint.** Short matches, compact map, fast respawns early, Siege Surge late.
- **Cross-platform parity.** One codebase and one ruleset. Touch gets twin-stick controls, smart-cast and auto-camera. Mouse gets precision aim and pointer lock.
- **Bots that play like people.** They lane, last-hit, trade, kite, lead their skillshots, dodge telegraphs and incoming projectiles, recall to shop, group for Drake and Warden, and avoid tower dives. Bots use the exact same input API as humans.
- **Instant play.** No install, no download: about 400 KB of source (~110 KB gzipped) and no external assets. Dynamic resolution scaling and three quality tiers keep phones smooth.

## Architecture

```
src/shared/            ← runs on BOTH server and browser
  constants.js map.js heroes.js items.js
  match.js             input queues, bot fill, per-player snapshots
  sim/world.js         authoritative 30 Hz simulation (combat, economy, structures, objectives)
  sim/abilities.js     all 30 champion abilities
  sim/units.js         minions, wraiths, jungle monsters, boss mechanics
  sim/bots.js          bot AI
src/client/
  engine/              WebGL2 renderer: instanced toon shading + outlines, terrain, water,
                       sky, particles, ground decals, MSAA + bloom post-process
  render/              procedural map, rigged champion/monster models, VFX
  game.js              interpolation, client-side prediction & reconciliation, 3rd-person camera
  input.js audio.js ui/
server/                static host + RFC 6455 WebSocket + rooms (zero deps)
tests/                 node:test simulation suite + Playwright e2e scripts
```

**Netcode.** The server is authoritative at 30 Hz and sends compact 15 Hz JSON snapshots with an event stream. Clients interpolate remote entities about 120 ms behind and **predict their own movement** with input replay against server acks. Projectiles are simulated client-side from spawn events, so they cost no bandwidth. If a player disconnects, the AI takes over their champion.

**Rendering.** Every model is assembled from a handful of primitives (box, sphere, limb, cone, gem, blade…) and drawn with **one instanced call per primitive**. The full scene is a few dozen draw calls, which is what keeps it fast on phones.

## Testing

```bash
npm test                         # 11 simulation tests incl. full Easy/Normal/Hard bot matches
node scripts/balance.mjs 16      # win-rate / KDA table across shuffled bot matches
node scripts/sidetest.mjs 8      # side-fairness check with identical compositions
npm start & node tests/e2e/play.mjs         # scripted desktop playthrough with screenshots
node tests/e2e/touch.mjs                    # mobile touch controls
node tests/e2e/multiplayer.mjs              # two browsers: create room, join, play, disconnect
```

The e2e scripts use Playwright with Chromium (they look for a global install); screenshots land in `tests/e2e/out/`. Append `?gallery` to the URL to line up all ten champion models.
