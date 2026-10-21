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

Designed so a high schooler can play with no instructions:

- A short briefing card gives the goal: capture a gold-star rail hub and hold it.
- A "sergeant" panel tells you what to do next in plain language, points at the right square with a yellow arrow, and walks through the first turns (select, move, dig in, end turn).
- Click a blue unit. Glowing squares show where it can walk; red targets are enemies it can attack. Hover a target to see the odds ("Good", "Even", "Terrible") before you commit.
- Buttons appear only for the selected unit: Dig in, Rest, Shell, Long barrage, Gas. Reinforcements are bought from the tray and placed in your rear.
- Red hatched squares are machine-gun fire zones; units standing in them get a pulsing red ring.
- The map is drawn on a canvas with animated units, shells, tracers, dust and gas. Sound effects (synthesized, off by default) can be turned on in the header. Zoom, Help and keyboard play (arrow keys, Enter, Esc, E to end the turn) are available.

Main menu: the game opens on a title screen with Continue (resumes the saved game), New game, How to play, and Teacher options (game length for new games: 6, 4 or 3 turns a year). A Menu button in the top bar and the end screen both return to it; the game stays saved. Nothing is saved until you enter a game.

Choosing a side: at the start you pick the Allies or Germany. The rules are identical (you are always the blue army, the computer the gray one); only names, helmets, historical text, hub names, and the timing of the computer's big 1918 push change. Played as Germany the map is turned 180 degrees (Channel on the right).

"Why?" buttons: battle-log lines about fights, shelling, machine guns, gas, tanks, and the computer's digging, flanking and counterattacks each expand into a one-sentence historical explanation of what just happened.

End-of-game debrief: a recap screen shows where your losses came from, your key moments, and six questions tied to the six learning goals. Each question shows numbers from the student's own game and has a box for their answer. "Copy my results" puts a plain-text report (name optional, stats, losses by cause, key moments, questions with answers) on the clipboard to paste into an assignment. Nothing is sent anywhere.

Teacher option: add `?turns=4` to the URL for 4 turns per year (2 to 6 allowed).

The map is drawn rotated to fit landscape screens: Allied rear at the bottom, Germans at the top, English Channel on the left, Switzerland on the right. The rules still use the 16 x 12 grid from `DESIGN.md`.

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

## Balance (from `node tests/sim.js 40` and `... 40 german`)

Fresh infantry are strength 10 (10,000 men); machine guns, artillery, tanks and stormtroopers are 5, 5, 6 and 6. Damage values, manpower pools and morale loss are scaled to match.

- Marching in the open and never digging: loses about 65 of 68 starting strength points.
- Digging everywhere and never attacking: a few points of casualties from the computer's local attacks, zero ground gained, armistice.
- A scripted 1918 combined-arms bot breaks through about 40% of the time (Allies) and 35% (Germany). Human players are expected to do worse.
- Computer aggression is set per army in `ai.aggression`: German 0.7, Allied 0.35. Higher means worse odds accepted, more shelling, and bigger local attacks (`ai.pushes` lists them by year and turn). Against a fully dug-in player the German computer launches about 8 local attacks per game and loses far more than it inflicts.

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
js/render.js   canvas battlefield, sprites, animations, mouse/keyboard input
js/audio.js    synthesized sound effects
js/coach.js    sergeant hints and the opening tutorial
js/ui.js       HUD, panels, dialogs and tooltips
js/main.js     game state, turn order, input
DESIGN.md      the full design document
```
