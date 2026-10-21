# Western Front

A turn-based strategy game about the stalemate on the Western Front in World War I. You command the Allied side against a computer-controlled German army. The rules are built so students discover the central paradox of trench warfare by playing: digging in is the only way to survive, but trenches are exactly what make winning nearly impossible.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no server, no accounts.

## Run it

Open `index.html` in a browser, or serve the folder statically (GitHub Pages, Netlify, `python3 -m http.server`).

## Build status

All six phases from `DESIGN.md` are implemented.

| Phase | Scope | Status |
|---|---|---|
| 1 | Core map and units | Done |
| 2 | Combat and digging (attacks, machine-gun fire, trench levels, over the top) | Done |
| 3 | Computer opponent (mirror digging, line extension, rail reserves, counterattacks) | Done |
| 4 | Years and technology (year cards, gas, long barrage, tanks, creeping barrage, stormtroopers, adaptations, 1918 offensive) | Done |
| 5 | Manpower, morale, endings (breakthrough, armistice, collapse, end screen) | Done |
| 6 | Tutorial and polish (coach hints, historical notes, keyboard and non-color cues) | Done, balance first pass |

## How to play

Click a blue unit, then use the action buttons: **Move** (click a dashed square), **Attack** (adjacent enemy), **Dig**, **Bombard / Long Barrage / Gas** (click a target in range), **Hold** (recovers 1 strength in a trench). **Recruit** spends your manpower pool on new units in the Allied rear. **End Turn** lets machine guns fire and the Germans move.

Tick "Always show machine-gun kill zones" to see the red squares at all times.

Teacher option: add `?turns=4` to the URL for 4 turns per year (2 to 6 allowed).

## Rule choices the design doc left open

All tunable in `js/config.js`:

- Adjacency and movement are orthogonal; ranges use Manhattan distance.
- One action per unit per turn (moving uses it up). A crater (cost 2) can always be entered as a first step.
- A tank crushes wire, ignores the over-the-top limit and is nearly immune to machine guns. Stormtroopers can pass through enemy squares but not stop on them.
- Digging in the contested columns gives the computer a "dig credit" for that row; it spends it on its next turn.
- Gas hits the target square and the squares directly north and south of it. The company is spent. The first attack does 6 damage, later ones 3, and 1 after German gas masks (1917).
- Recruits cost their starting strength in manpower points and are placed in the Allied rear. Americans arrive free in 1918.
- Ground gained = squares beyond your starting line (column D) that you currently own. A square flips to the Germans if they move into it.
- A breakthrough means an Allied unit starts a German turn on a rail hub and is still there after it.

## Balance (first pass, from `node tests/sim.js`)

- Marching in the open and never digging: loses about 45 of 48 starting strength points.
- Digging everywhere and never attacking: zero casualties, zero ground, armistice.
- A scripted 1918 combined-arms bot (long barrages, tanks, stormtroopers on a hub) broke through about half the time. Human players are expected to do worse; tune `ai.*`, `recruitCost` and `manpowerByYear` in `config.js` if it is too easy in classroom testing.

## Tests

```
node tests/phase1.test.js   movement, terrain, kill zones
node tests/ai.test.js       flank matching, mirror digging, trench reduction, machine guns
node tests/sim.js 40        balance simulation with three scripted strategies
```

## Files

```
index.html
css/style.css
js/config.js   all tunable numbers
js/map.js      grid, terrain, trench levels
js/units.js    unit creation, movement, kill zones
js/years.js    year cards, notes, tutorial hints, end screen data
js/combat.js   attacks, machine guns, bombardment, gas, digging
js/ai.js       computer opponent
js/ui.js       rendering and DOM events
js/main.js     game state, turn order, input
DESIGN.md      the full design document
```
