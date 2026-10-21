# Western Front: Design Document

A turn-based strategy game about the stalemate on the Western Front in World War I. The player commands the Allied side and tries to break through a computer-controlled German army. Students discover the central paradox of trench warfare by playing: digging in is the only way to survive, but the trenches are exactly what make winning nearly impossible.

## 1. Learning Goals

By the end of one playthrough, students should be able to explain:

1. **Defense was stronger than offense.** Machine guns, artillery and barbed wire made attacking across open ground suicidal.
2. **Digging in kept armies alive but froze the war.** Both sides entrenched to survive, and the result was a fixed front.
3. **Flanking failed (the Race to the Sea).** Every attempt to go around the enemy was matched until the trench line ran from the English Channel to Switzerland.
4. **Breaking in was not breaking through.** Defenders could rush reserves by railroad faster than attackers could advance on foot through mud and craters.
5. **New technology gave only temporary advantages.** Gas, tanks and new tactics each worked briefly before the other side adapted.
6. **The cost was enormous.** Huge casualties for tiny gains, and the war ended mostly through exhaustion.

The game never lectures these points. The rules produce them, and short historical notes confirm what the student just experienced.

## 2. Classroom Fit

- **Playthrough length:** 15-20 minutes, leaving time for a debrief in a 56-minute period.
- **Players:** Solo, but works for pairs sharing one screen (one student moves, one advises).
- **Devices:** School Chromebooks first. Mouse/trackpad click controls, also usable on touch screens.
- **Hosting:** Static site (GitHub Pages or Netlify). Students open a link, nothing to install, no login.
- **Winnable?** Yes, but only in 1918 and only with combined tactics. Most first attempts should end in the armistice with no breakthrough. That outcome is the lesson, not a failure state.

## 3. Technical Constraints

- Plain HTML, CSS and JavaScript. No frameworks, no build step.
- Runs entirely in the browser. No server, no accounts, no data collection.
- Loads fast on school wifi: no large image or audio files. Map and units are drawn with CSS or simple SVG icons.
- All balance numbers live in one config file so they can be tuned without touching game logic.
- Optional: save progress in localStorage (wrapped in try/catch) so a refresh doesn't lose a game.

Suggested file structure:

```
index.html
css/style.css
js/config.js     all tunable numbers (damage, costs, turns per year, etc.)
js/map.js        grid, terrain, trench levels
js/units.js      unit types and stats
js/combat.js     attack, bombardment, damage resolution
js/ai.js         computer opponent behavior
js/years.js      year-by-year unlocks, events, historical notes
js/ui.js         rendering, click handling, message log, screens
js/main.js       game loop and turn order
README.md
DESIGN.md
```

## 4. The Map

Grid: 16 rows (north to south) by 12 columns (west to east). Each square is one sector of the front.

- **North edge:** English Channel coast. **South edge:** Swiss border. Neither can be passed, which is what ends the Race to the Sea.
- **West side (columns 1-3):** Allied rear. Player reinforcements arrive here.
- **East side (columns 10-12):** German rear. Contains a rail line running north to south along column 11 and two rail hubs (the breakthrough objectives).
- **Middle (columns 4-9):** Contested ground that becomes no man's land.

### Terrain types

| Terrain | Effect |
|---|---|
| Open ground | Normal movement. No protection. |
| Trench (level 1-3) | Damage reduction for the occupant (see Digging). Stays on the map permanently, even if abandoned. |
| Barbed wire | Entering costs a unit its whole turn. Can be cleared by artillery or tanks. |
| Craters / mud | Created by artillery. Movement cost doubled. Lasts the rest of the game. |
| Rail line | German reserves move along it very fast. Allied units cannot use it. |
| Rail hub | Objective. Capture and hold one for a full turn to achieve a breakthrough. |

Craters are an intentional double edge: the bombardment that weakens the enemy also wrecks the ground your own troops must cross.

## 5. Units

Each unit has strength from 1 to 10. Each strength point represents 1,000 men, which feeds the casualty counter.

| Unit | Move | Role | Available |
|---|---|---|---|
| Infantry | 2 | Moves, attacks, digs, captures squares | 1914 |
| Machine Gun | 1 | Devastating fire on open squares within 2; weak on its own in close attack | 1914 |
| Artillery | 1 | Bombards squares within 4; never captures ground; creates craters | 1914 |
| Gas Company | 1 | One-time gas attack on a 3-square area | 1915 |
| Tank | 1 | Crosses wire and trenches, protects adjacent infantry; may break down | 1917 |
| Stormtroopers | 3 | Infiltration: can move past an enemy square instead of stopping | 1918 |

The player starts with a small force and gets a fixed number of new units at the start of each year, limited by the manpower pool (see Section 9).

## 6. Actions

On their turn, the player can give each unit one action:

- **Move:** to an adjacent or nearby square, based on move points and terrain.
- **Attack:** an adjacent enemy square.
- **Dig:** raise the trench level of the unit's current square by 1 (maximum 3).
- **Bombard** (artillery only): hit a square in range. Choose a short or long bombardment (Section 8).
- **Hold:** do nothing. Units in trenches recover 1 strength point per Hold, up to their maximum.

Then the player presses End Turn and the computer moves.

## 7. Digging: The Core Paradox

This is the most important mechanic in the game. It must make digging feel necessary and also feel like a trap.

**Why you must dig:**

- Damage taken by a unit in a trench is reduced: level 1 by 40%, level 2 by 60%, level 3 by 80%.
- A unit in the open within range of a Machine Gun takes heavy damage every enemy turn. Staying in the open for more than a turn or two near the enemy should be close to fatal.

**Why digging traps you:**

- **Going over the top:** a unit leaving a trench toward the enemy can only move 1 square that turn, regardless of its move stat, and loses all protection.
- **The computer matches every trench.** When the player digs a square, the computer digs the facing square on its next turn (Section 10). Fortifying never gives a lasting edge.
- **Trenches never disappear.** Every trench either side digs stays on the map. Over time the middle of the map fills with defensive positions, wire and craters.

The intended experience: in 1914 students march forward in the open and get cut down. They dig in to survive. By 1915 the front is locked, and every attack out of the trench is a slaughter.

## 8. Combat

- **Attack resolution:** attacker strength x attack modifier vs. defender strength x defense modifier (trench, wire, adjacent machine guns). Both sides lose strength. The attacker almost always loses more unless the defender was weakened first.
- **Machine gun fire:** happens automatically during the owner's turn on every enemy unit in an open square within 2. This is what turns no man's land into a kill zone.
- Units at 0 strength are destroyed. Their losses go to the casualty counter.

### Bombardment

- **Short bombardment:** moderate damage to the target, small crater chance.
- **Long bombardment (from 1916):** heavy damage and guaranteed craters on the target and nearby squares, but the computer is warned and moves reserves toward that sector on its next turn. This models how week-long bombardments like the one before the Somme gave the attack away.
- **Creeping barrage (from 1917):** if infantry attack a square the same turn it was bombarded, the defender gets no machine gun bonus that turn. Teaches that artillery and infantry had to work together.

## 9. Manpower and Home Front Morale

- **Manpower pool:** each year the player gets a limited number of strength points to spend on new units. Destroyed units are gone for good.
- **Home front morale:** starts at 100. Drops as casualties pile up, and drops faster after a failed offensive (an attack that loses heavily and gains no ground).
- **Morale at 0:** the game ends in defeat with a short note about the 1917 French army mutinies and Russia's collapse into revolution.
- **Casualty counter:** always visible, shown as total men lost (strength points x 1,000).

## 10. The Computer Opponent

The computer follows simple, readable rules. Students should be able to figure out what it is doing, because understanding its behavior is part of understanding the war.

- **Mirror digging.** For every trench square the player digs in the middle columns, the computer digs the facing square in the same row on its next turn.
- **Extend the line.** If the player has units in a row with no German trench facing them, the computer moves a reserve unit to that row and digs. Because reserves move fast by rail, it almost always gets there first. Repeated flanking pushes the line to the north and south edges: the Race to the Sea.
- **Reserves by rail.** If the player captures a German front-line trench, the computer moves up to 2 reserve units along the rail line (up to 6 squares each) and counterattacks the gap the next turn. The player's units, crossing craters on foot, move 1 square. The gap usually closes.
- **Defend first.** The computer rarely attacks. It mostly holds, digs, and counterattacks lost squares, like the German strategy of defending captured French and Belgian territory. Exception: in spring 1918 it launches one large offensive (Section 11), then becomes exhausted.
- **Adapt to new weapons.** After the player uses a new technology for the first time, the computer gets a counter at the start of the next year (gas masks, anti-tank defenses).

## 11. Years and Pacing

The game runs from 1914 to November 1918. Each year is 6 turns (30 turns total). At an average of 30-40 seconds a turn, that's about 15-20 minutes.

Each year starts with a short year card (2-3 sentences of history and what's new), then play continues.

| Year | What happens | What it teaches |
|---|---|---|
| 1914 | Map starts with no trenches. Both armies are in the open. The first two turns are a guided tutorial (move, attack, dig). | Open warfare gets slaughtered. Digging in is the only way to survive. Flanking triggers the Race to the Sea. |
| 1915 | Gas unlocks. First use is very effective. | New weapons give a brief edge. |
| 1916 | Long bombardment unlocks. Bigger manpower pool for one massive offensive. | Huge attacks, huge losses, tiny gains (the Somme, Verdun). |
| 1917 | Gas masks for the computer. Tanks and creeping barrage unlock. Tanks have a 30% chance of breaking down each turn. | Tanks helped but were unreliable. Morale is cracking. |
| 1918 | Stormtroopers unlock. Spring: the computer launches one big offensive into the player's lines, then its reserves shrink each turn. American reinforcements arrive for the player. | A breakthrough finally becomes possible, but only by combining artillery, tanks and infantry. |

**End of the game:** if no breakthrough by the last turn of 1918, the Armistice screen appears (November 11, 1918). This is the most common ending and should feel historically "right," not like a loss.

## 12. Win and End Conditions

| Ending | Condition |
|---|---|
| Breakthrough | Capture a rail hub and hold it through the computer's next turn. Rare, realistically only possible in 1918. |
| Armistice | Reach the end of 1918 without a breakthrough and without morale collapse. |
| Collapse | Home front morale reaches 0. |

## 13. End Screen

Every ending shows:

- Total casualties (men)
- Squares of ground gained (and the farthest any unit advanced)
- Casualties per square gained
- A historical comparison, e.g. "On the first day of the Battle of the Somme, the British suffered about 57,000 casualties."
- 2-3 reflection questions, for example:
  - Why did digging in keep you alive but stop you from winning?
  - What happened when you tried to go around the enemy?
  - What finally worked, and why did it take until 1918?
- A Play Again button

## 14. Interface

- Map takes most of the screen. The player's side is blue, the computer's side is gray, with icons and patterns (not color alone) so it works for color-blind students.
- Trench levels shown as 1-3 lines on the square.
- Selecting a unit shows its stats and highlights legal moves, attack targets, and squares under machine gun fire (red tint), so students can see the kill zone.
- Action bar with large buttons: Move, Attack, Dig, Bombard, Hold, End Turn.
- Top bar: current year and turn, casualty counter, morale bar, manpower remaining.
- Message log: short lines after each turn ("Your attack on sector F7 failed. 3,000 casualties.") with occasional one-line historical notes.
- Large readable fonts and click targets for Chromebook trackpads and touch.

## 15. Balance Targets

These guide tuning in `config.js`:

- A student who never digs should lose most of their army by the end of 1914.
- A student who digs everywhere and never attacks reaches the Armistice with low casualties and zero ground gained. They "survived" but didn't win, which is a good debrief point.
- Attacks from 1915-1917 should usually cost more strength than they take from the defender, even with bombardment.
- In 1918, a well-coordinated attack (bombard, then tanks and stormtroopers together) should break through roughly 1 in 3 times.
- Flanking should always be matched by the computer within 1-2 turns.

## 16. Build Phases

1. Core map and units: grid, terrain, unit placement, selection, movement.
2. Combat and digging: attacks, machine gun fire, trench levels, damage reduction, going over the top.
3. Computer opponent: mirror digging, line extension, reserves by rail, counterattacks.
4. Years and technology: year cards, unlocks, computer adaptations, 1918 offensive.
5. Manpower, morale, and endings: counters, end conditions, end screen with comparisons and questions.
6. Tutorial and polish: guided first turns, message log notes, accessibility pass, balance tuning.

Each phase should leave the game playable so it can be tested before moving on.

## 17. Open Questions

- Should students be able to choose to play the German side?
- Should there be a teacher option to shorten the game (for example, 4 turns per year)?
- Is a "survival" ranking (low casualties) worth showing alongside the breakthrough goal?
