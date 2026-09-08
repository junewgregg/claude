# Affinity

A browser-based arena battler inspired by the in-universe game "Affinity" from
M.K. England's *Player Vs. Player* trilogy. Pure HTML/CSS/JavaScript, no
build step and no external assets — drop the folder on any static web host
(GitHub Pages, Netlify, S3, etc.) and it runs.

## Playing it locally

```
cd affinity-game
python3 -m http.server 8080
# open http://localhost:8080
```

## Controls

**Desktop:** WASD to move, mouse to aim, left-click to attack (one click, one
swing), 1-4 for abilities, R (or Space) for your ultimate, E to interact with
hub portals.

**Mobile/touch:** left half of the screen is a virtual movement joystick,
right half is an aim-and-attack joystick (hold it to keep swinging), with
ability/ultimate/interact buttons docked in the corner.

## Match rules

Every mode is a **2-minute timed deathmatch**. The team with the **most kills**
when the clock hits zero wins — a tie is broken by fewest deaths. Nobody is
eliminated for good: fall in battle and you **respawn 5 seconds later** with a
brief spell of spawn protection, your ability cooldowns reset (your ultimate
keeps its own timer running). In the battle-royale modes a storm circle still
closes in over the match, herding everyone toward the middle for the endgame.

## What's here

- **10 affinities** (Nature, Starlight, Nanotech, Robotics, Paranormality,
  Demonology, Faerie, Song, Alchemy, Ancient Runes) — each with a distinct
  color identity, a passive combat trait, and a pair of flavor words used to
  name your abilities.
- **12 tekniks** across 4 roles (Tank: Sword Knight/Mech/Titan · Healer:
  Mender/Scholar/Surgeon · Melee DPS: Rogue/Martial Artist/Engineer · Ranged
  DPS: Archer/Demolitionist/Sorcerer) — each with its own base attack, four
  abilities, and an ultimate.
- **120 possible characters** built by combining the two: the teknik shapes
  the kit, the affinity colors and names it and adds its passive.
- **A walkable hub island** with decorations and portals into every mode.
- **Game modes:** 8-Player Free-for-All, 4v4 Battle Royale, 2v2v2v2 Battle
  Royale (both with a shrinking storm zone), and a 16-team single-elimination
  4v4 Tournament where your squad stays together across every round while the
  rest of the bracket plays out around you.
- **5 arenas** plus the hub, all drawn with canvas primitives.
- **AI opponents** that pick targets, kite or engage based on role, manage
  their cooldowns, and play at a competent "average player" level rather
  than perfectly.

## Code layout

```
index.html            screens + canvas + script loading order
css/style.css          all styling, responsive + light/dark aware
js/data/                affinities.js, tekniks.js, maps.js (pure data)
js/character.js         combines an affinity + teknik into a character sheet
js/input.js             keyboard/mouse + twin-joystick touch input
js/game/entity.js        live combat entity (hp/shield/status/cooldowns)
js/game/movement.js      shared movement + obstacle collision
js/game/combat.js        basic attacks, ability effects, projectiles, turrets
js/game/ai.js            AI decision loop
js/game/modes.js         mode configs, roster building, tournament bracket
js/game/engine.js        per-match simulation loop, storm zone, win checks
js/game/hub.js           hub island walk-around + portal interaction
js/game/renderer.js      all canvas drawing
js/ui.js                 DOM rendering for every non-canvas screen
js/main.js               screen state machine wiring everything together
```
