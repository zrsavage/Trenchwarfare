# Western Front

A turn-based strategy game about the stalemate on the Western Front in World War I. You command the Allied side against a computer-controlled German army. The rules are built so students discover the central paradox of trench warfare by playing: digging in is the only way to survive, but trenches are exactly what make winning nearly impossible.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no server, no accounts.

## Run it

Open `index.html` in a browser, or serve the folder statically (GitHub Pages, Netlify, `python3 -m http.server`).

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Core map and units: grid, terrain, placement, selection, movement | **Done** |
| 2 | Combat and digging | Planned |
| 3 | Computer opponent | Planned |
| 4 | Years and technology | Planned |
| 5 | Manpower, morale, endings | Planned |
| 6 | Tutorial and polish | Planned |

### What works in phase 1

- 16 x 12 map (Channel to Switzerland) with Allied rear, contested ground, German rear, a rail line on column K and two rail hubs.
- Terrain data model: trench levels 1-3, barbed wire, craters/mud, rail, hubs. Nothing creates them yet (digging and artillery arrive in phase 2); `startingTerrain` in `js/config.js` can place some for testing.
- Units with stats from the design doc; the 1914 forces (infantry, machine guns, artillery) are placed on both sides.
- Select a unit, see its stats, see legal moves with their cost, and see machine-gun kill zones (red hatching).
- Movement rules: orthogonal steps, craters cost 2, wire ends the move, enemies block, leaving a trench toward the enemy allows one square only.
- Hold, End Turn, turn/year counter, message log, top bar, keyboard navigation (arrow keys, Enter), localStorage save.
- Attack, Dig and Bombard buttons are present but disabled until phase 2. The German turn is a placeholder until phase 3.

### Rule choices made in phase 1

The design doc leaves these open; they are all in `js/map.js` / `js/units.js` / `js/config.js`:

- Adjacency and movement are **orthogonal**; ranges use **Manhattan distance**.
- A unit that cannot afford a crater (cost 2) may still enter it as its first step.
- Each unit gets one action per turn, so moving uses it up.

## Tests

```
node tests/phase1.test.js
```

## Files

```
index.html
css/style.css
js/config.js   all tunable numbers
js/map.js      grid, terrain, trench levels
js/units.js    unit creation, movement, kill zones
js/ui.js       rendering and DOM events
js/main.js     game state, turn order, input
DESIGN.md      the full design document
```

`combat.js`, `ai.js` and `years.js` are added in later phases.
