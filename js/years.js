// Year-by-year unlocks, events, historical notes, tutorial hints and the end screen.
globalThis.WF = globalThis.WF || {};

WF.Years = (function () {
  const C = WF.CONFIG, U = WF.Units, M = WF.Map;

  const CARDS = {
    1914: { title: '1914: The War of Movement',
      text: 'August 1914. Armies march into France expecting a short war. You command the Allies (blue); the Germans (gray) face you across open ground. Machine guns and artillery are about to change everything.',
      news: 'Infantry, machine guns and artillery are available.' },
    1915: { title: '1915: Gas and Stalemate',
      text: 'The front has frozen into trenches from the Channel to Switzerland. At Ypres in April the Germans use poison gas for the first time. Both sides search for a way to break the deadlock.',
      news: 'Gas companies unlock. A first gas attack is devastating.' },
    1916: { title: '1916: Verdun and the Somme',
      text: 'Both sides launch enormous offensives. At the Somme the British guns pound the German lines for a week, and the Germans know exactly where the attack is coming.',
      news: 'Long bombardment unlocks (heavy damage, but it warns the enemy). A bigger manpower pool for one massive offensive.' },
    1917: { title: '1917: Tanks and Fatigue',
      text: 'Tanks and creeping barrages appear, but the armies are exhausted. French troops mutiny after the Nivelle Offensive and Russia collapses into revolution. The Germans have gas masks now.',
      news: 'Tanks (30% chance to break down each turn) and creeping barrage unlock. Home-front morale takes a hit.' },
    1918: { title: '1918: The Last Year',
      text: 'Russia is out of the war and Germany gambles on a spring offensive before the Americans arrive in force. If you survive it, new tactics may finally make a breakthrough possible.',
      news: 'Stormtroopers unlock. American reinforcements arrive. Expect a big German offensive this spring.' },
  };

  const NOTES = {
    machineGun: 'Machine guns fired hundreds of rounds a minute. Open ground became a killing zone.',
    firstDig: 'Trenches saved lives. Within weeks of the first battles, soldiers on both sides were digging in.',
    mirror: 'The Germans dig in opposite every trench you dig. Fortifying gave neither side a lasting edge.',
    extend: 'The Race to the Sea: each side tried to outflank the other until the trenches reached the Channel.',
    failedAttack: 'Attackers crossing open ground often lost far more men than the defenders.',
    firstCapture: 'Breaking in is not breaking through. Reserves arrive by rail faster than infantry can advance through mud.',
    counter: 'German reserves rush to the gap by rail. Defenders usually reinforced faster than attackers could advance.',
    crater: 'Shell craters turned the battlefield into mud. The ground you bombard is the ground you must cross.',
    longBombard: 'The week-long barrage before the Somme warned the Germans exactly where the attack would fall.',
    creeping: 'The creeping barrage kept defenders\' heads down while infantry crossed no man\'s land.',
    gas: 'At Ypres in 1915 the first gas attack stunned the defenders. Soon both sides had gas masks.',
    gasMask: 'Gas masks cut the effect of later attacks.',
    tankBreak: 'Early tanks were slow and unreliable. Many broke down before reaching the enemy.',
    offensive: 'In March 1918 the Germans struck with their last great offensive, using stormtrooper infiltration tactics.',
    exhausted: 'The spring offensive gained ground but cost Germany reserves it could not replace.',
    storm: 'Stormtroopers infiltrated past strongpoints instead of attacking them head on.',
    hub: 'You have reached a rail hub. If you can hold it, the German line may collapse.',
  };

  function note(g, key) {
    g.notes = g.notes || {};
    if (g.notes[key] || !NOTES[key]) return;
    g.notes[key] = true;
    g.log.push({ text: NOTES[key], kind: 'note' });
  }

  function card(year) { return CARDS[year]; }

  // Called when a new year begins (not for the very first one: main shows that card).
  function startYear(g) {
    const y = g.year;
    g.manpower += C.manpowerByYear[y] || 0;
    const msgs = [];
    if (C.morale.yearHit[y]) {
      g.morale = Math.max(0, g.morale - C.morale.yearHit[y]);
      msgs.push('Home-front morale falls as the war drags on.');
    }
    if (g.techUsed.gas && !g.counters.gasMasks && y >= C.counters.gasMasksFrom) {
      g.counters.gasMasks = true; msgs.push('The Germans have issued gas masks.'); note(g, 'gasMask');
    }
    if (g.techUsed.tank && !g.counters.antiTank && y >= C.counters.antiTankFrom) {
      g.counters.antiTank = true; msgs.push('The Germans have anti-tank defenses. Tanks are less effective and break down more.');
    }
    if (y === C.americans.year) {
      let placed = 0;
      for (let r = 0; r < C.rows && placed < C.americans.count; r += 3) {
        for (const c of C.alliedRearCols) {
          if (!U.at(g, r + 1, c) && placed < C.americans.count) {
            U.create(g, 'infantry', 'allied', r + 1, c, C.americans.strength); placed++; break;
          }
        }
      }
      msgs.push('American troops arrive: ' + placed + ' fresh infantry units in the Allied rear.');
    }
    if (y === 1918) note(g, 'storm');
    g.log.push({ text: '— ' + y + ' —', kind: 'note' });
    for (const m of msgs) g.log.push({ text: m, kind: 'note' });
    return msgs;
  }

  // Guided first turns (1914).
  function coach(g) {
    if (g.year !== C.startYear || g.tutorialOff) return null;
    const t = g.tut;
    if (!t.moved) return 'Tutorial 1/3. Move: click a blue unit, then a dashed square. Try advancing an infantry unit.';
    if (!t.dug) return 'Tutorial 2/3. Dig: select an infantry unit and press Dig. A trench cuts damage by 40% (level 1) up to 80% (level 3). Red squares are under machine-gun fire.';
    if (!t.attacked) return 'Tutorial 3/3. Attack: move next to a German unit, then select your unit and press Attack. Expect losses. Press End Turn when ready.';
    return null;
  }

  // ---- End screen ----
  const SOMME = 57000;
  function endSummary(g, type) {
    const men = g.casualties * C.menPerStrength;
    const gained = gainedSquares(g);
    const per = gained > 0 ? Math.round(men / gained) : null;
    const titles = {
      breakthrough: 'Breakthrough!',
      armistice: 'Armistice, November 11, 1918',
      collapse: 'The Home Front Collapses',
    };
    const lead = {
      breakthrough: 'You held a rail hub through the German counterattack. In reality, no army achieved a lasting breakthrough until the German line was worn down in the Hundred Days of late 1918.',
      armistice: 'The guns fall silent at eleven o\'clock. Neither side broke the other; the war ended mostly through exhaustion. Most commanders ended exactly where you did.',
      collapse: 'Morale has broken. In 1917 French soldiers mutinied after the Nivelle Offensive and Russia collapsed into revolution as the war\'s cost became unbearable.',
    };
    const comparisons = [];
    comparisons.push('On the first day of the Battle of the Somme (July 1, 1916), the British suffered about 57,000 casualties' +
      (men ? ' — ' + (men >= SOMME ? 'your losses were ' + (men / SOMME).toFixed(1) + ' times that.' : 'about ' + Math.round(men / SOMME * 100) + '% of your losses.') : '.'));
    comparisons.push('The Battle of Verdun (1916) cost roughly 700,000 casualties on both sides for almost no change in the front line.');
    if (per) comparisons.push('You paid about ' + per.toLocaleString() + ' casualties per square gained.');
    else if (gained > 0) comparisons.push('You gained ground without taking casualties, but ' + gained + ' square(s) is a tiny gain. Surviving in the trenches is not the same as winning.');
    else comparisons.push('You gained no ground at all. Surviving in the trenches is not the same as winning.');
    return {
      title: titles[type], lead: lead[type], type,
      stats: [
        ['Total casualties (men)', men.toLocaleString()],
        ['German casualties (men)', (g.gCasualties * C.menPerStrength).toLocaleString()],
        ['Squares of ground gained', gained],
        ['Farthest advance', g.farthest >= 4 ? 'Column ' + 'ABCDEFGHIJKL'[g.farthest] : 'Not past your line'],
        ['Casualties per square gained', per ? per.toLocaleString() : 'n/a'],
        ['Final morale', Math.round(g.morale)],
      ],
      comparisons,
      questions: [
        'Why did digging in keep you alive but stop you from winning?',
        'What happened when you tried to go around the enemy?',
        'What finally worked, and why did it take until 1918?',
      ],
    };
  }

  // Allied-held squares beyond the starting line.
  function gainedSquares(g) {
    let n = 0;
    for (let r = 0; r < C.rows; r++) for (let c = C.alliedFront + 1; c < C.cols; c++) if (g.owner[r][c] === 'a') n++;
    return n;
  }

  return { CARDS, NOTES, note, card, startYear, coach, endSummary, gainedSquares };
})();
