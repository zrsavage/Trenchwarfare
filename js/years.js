// Year-by-year unlocks, events, historical notes, tutorial hints, and the end-of-game recap.
globalThis.WF = globalThis.WF || {};

WF.Years = (function () {
  const C = WF.CONFIG, U = WF.Units, M = WF.Map, N = WF.Names;

  const CARDS = {
    allied: {
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
    },
    german: {
      1914: { title: '1914: The War of Movement',
        text: 'August 1914. Germany\'s armies sweep into Belgium and France, hoping to win before Russia can mobilize. You command the German army (shown in blue); the Allies (gray) face you across open ground. Machine guns and artillery are about to change everything.',
        news: 'Infantry, machine guns and artillery are available.' },
      1915: { title: '1915: Gas and Stalemate',
        text: 'The front has frozen into trenches from the Channel to Switzerland. At Ypres in April your army uses poison gas for the first time. Both sides search for a way to break the deadlock.',
        news: 'Gas companies unlock. A first gas attack is devastating.' },
      1916: { title: '1916: Verdun and the Somme',
        text: 'Germany attacks at Verdun, hoping to bleed France white, while British and French armies strike at the Somme. Huge battles bring huge losses and tiny gains.',
        news: 'Long bombardment unlocks (heavy damage, but it warns the enemy). A bigger manpower pool for one massive offensive.' },
      1917: { title: '1917: Tanks and Fatigue',
        text: 'The Allies bring tanks, and German submarines draw America into the war. Hunger spreads at home and the army is tired. The Allies have gas masks now.',
        news: 'Tanks (30% chance to break down each turn) and creeping barrage unlock. Home-front morale takes a hit.' },
      1918: { title: '1918: The Last Chance',
        text: 'Russia is out of the war, so divisions are freed from the Eastern Front. This is Germany\'s last chance to win before the Americans arrive in force. Later in the summer, the Allies will counterattack.',
        news: 'Stormtroopers unlock. Divisions arrive from the Eastern Front. Expect an Allied counteroffensive in late summer.' },
    },
  };

  // {E} = enemy adjective, {EP} = enemy plural. Values may be functions of the game.
  const NOTES = {
    machineGun: 'Machine guns fired hundreds of rounds a minute. Open ground became a killing zone.',
    firstDig: 'Trenches saved lives. Within weeks of the first battles, soldiers on both sides were digging in.',
    mirror: '{EP} dig in opposite every trench you dig. Fortifying gave neither side a lasting edge.',
    extend: 'The Race to the Sea: each side tried to outflank the other until the trenches reached the Channel.',
    failedAttack: 'Attackers crossing open ground often lost far more men than the defenders.',
    firstCapture: 'Breaking in is not breaking through. Reserves arrive by rail faster than infantry can advance through mud.',
    counter: '{E} reserves rush to the gap by rail. Defenders usually reinforced faster than attackers could advance.',
    crater: 'Shell craters turned the battlefield into mud. The ground you bombard is the ground you must cross.',
    longBombard: 'The week-long barrage before the Somme warned the defenders exactly where the attack would fall.',
    creeping: 'The creeping barrage kept defenders\' heads down while infantry crossed no man\'s land.',
    gas: 'At Ypres in 1915 the first gas attack stunned the defenders. Soon both sides had gas masks.',
    gasMask: 'Gas masks cut the effect of later attacks.',
    tankBreak: 'Early tanks were slow and unreliable. Many broke down before reaching the enemy.',
    offensive: g => (g.player === 'german'
      ? 'In August 1918 the Allies counterattacked at Amiens with tanks and infantry. It was called the black day of the German army.'
      : 'In March 1918 the Germans struck with their last great offensive, using stormtrooper infiltration tactics.'),
    exhausted: 'The offensive gained ground but cost the attacker reserves it could not replace.',
    storm: 'Stormtroopers infiltrated past strongpoints instead of attacking them head on. The tactic was a German invention.',
    hub: 'You have reached a rail hub. If you can hold it, the enemy line may collapse.',
  };

  // Short lines for the end-of-game "key moments" list.
  const MOMENTS = {
    firstDig: 'You dug your first trench.',
    mirror: 'The enemy dug in opposite your trench.',
    extend: 'The enemy sent reserves to match your flanking move.',
    failedAttack: 'Your first costly failed attack.',
    firstCapture: 'You captured an enemy trench.',
    counter: 'Enemy reserves counterattacked by rail.',
    gas: 'You used gas for the first time.',
    longBombard: 'You fired your first long bombardment.',
    tankBreak: 'One of your tanks broke down.',
    offensive: 'The enemy launched its big offensive.',
    hub: 'You reached an enemy rail hub.',
  };

  const fill = (g, t) => (typeof t === 'function' ? t(g) : t).replace(/\{EP\}/g, N.foeP(g)).replace(/\{E\}/g, N.foe(g));
  const when = g => g.year + ', turn ' + g.turn;

  function moment(g, key, text) {
    g.moments = g.moments || [];
    if (g.moments.some(m => m.key === key)) return;
    g.moments.push({ key, label: when(g), text });
  }

  function note(g, key) {
    g.notes = g.notes || {};
    if (g.notes[key] || !NOTES[key]) return;
    g.notes[key] = true;
    g.log.push({ text: fill(g, NOTES[key]), kind: 'note' });
    if (MOMENTS[key]) moment(g, key, MOMENTS[key]);
  }

  const card = (year, g) => CARDS[(g && g.player) || 'allied'][year];

  // Called when a new year begins (not for the very first one: main shows that card).
  function startYear(g) {
    const y = g.year;
    g.manpower += C.manpowerByYear[y] || 0;
    const msgs = [];
    g.counterYear = g.counterYear || {};
    if (C.morale.yearHit[y]) {
      g.morale = Math.max(0, g.morale - C.morale.yearHit[y]);
      msgs.push('Home-front morale falls as the war drags on.');
    }
    if (g.techUsed.gas && !g.counters.gasMasks && y >= C.counters.gasMasksFrom) {
      g.counters.gasMasks = true; g.counterYear.gasMasks = y; msgs.push(N.foeP(g) + ' have issued gas masks.'); note(g, 'gasMask');
    }
    if (g.techUsed.tank && !g.counters.antiTank && y >= C.counters.antiTankFrom) {
      g.counters.antiTank = true; g.counterYear.antiTank = y; msgs.push(N.foeP(g) + ' have anti-tank defenses. Tanks are less effective and break down more.');
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
      msgs.push((g.player === 'german' ? 'Divisions arrive from the Eastern Front: ' : 'American troops arrive: ') + placed + ' fresh infantry units in your rear.');
    }
    if (y === 1918) note(g, 'storm');
    g.log.push({ text: '— ' + y + ' —', kind: 'note' });
    for (const m of msgs) g.log.push({ text: m, kind: 'note' });
    return msgs;
  }

  // ---- Recap ----
  const CAUSES = { machinegun: 'Machine guns', shelling: 'Artillery shells', assault: 'Infantry assaults', gas: 'Gas', other: 'Other' };
  const pct = r => Math.round(r * 100) + '%';
  const pl = (n, w, p) => n + ' ' + (n === 1 ? w : p || w + 's');

  function gainedSquares(g) {
    let n = 0;
    for (let r = 0; r < C.rows; r++) for (let c = C.alliedFront + 1; c < C.cols; c++) if (g.owner[r][c] === 'a') n++;
    return n;
  }

  function causeList(g) {
    const lost = (g.stats && g.stats.lost.allied) || {};
    const total = Object.values(lost).reduce((a, b) => a + b, 0) || 0;
    return Object.keys(CAUSES).filter(k => lost[k]).map(k => ({ key: k, label: CAUSES[k], men: lost[k] * C.menPerStrength, share: total ? lost[k] / total : 0 }))
      .sort((a, b) => b.men - a.men);
  }

  function techLine(g) {
    const bits = [];
    if (g.techUsed.gas) bits.push('You used gas first in ' + g.techUsed.gas.y + (g.counterYear && g.counterYear.gasMasks ? '; the enemy had gas masks by ' + g.counterYear.gasMasks + '.' : '; the enemy had not yet adapted.'));
    if (g.techUsed.tank) bits.push('You used tanks first in ' + g.techUsed.tank.y + (g.counterYear && g.counterYear.antiTank ? '; the enemy had anti-tank defenses by ' + g.counterYear.antiTank + '.' : '.'));
    if (g.notes && g.notes.longBombard) bits.push('You fired long bombardments, which warned the enemy.');
    return bits.length ? bits.join(' ') : 'You did not use any of the new weapons (gas, long bombardment, tanks).';
  }

  function endSummary(g, type) {
    const st = g.stats || { lost: { allied: {}, german: {} }, attacks: { made: 0, won: 0 }, digs: { allied: 0, german: 0 }, flankMatches: 0, counters: 0, captures: 0, exposedTurns: 0, shells: 0, worst: { men: 0 } };
    const men = g.casualties * C.menPerStrength, gained = gainedSquares(g), per = gained > 0 && men ? Math.round(men / gained) : null;
    const causes = causeList(g), me = N.me(g), foe = N.foe(g);
    const gm = (g.player === 'german');
    const titles = { breakthrough: 'Breakthrough!', armistice: 'Armistice, November 11, 1918', collapse: 'The Home Front Collapses' };
    const lead = {
      breakthrough: gm ? 'You held an Allied rail junction through the counterattack. In reality, Germany\'s 1918 offensives gained ground but never achieved a decisive breakthrough, and the army could not hold what it won.'
        : 'You held a rail hub through the German counterattack. In reality, no army achieved a lasting breakthrough until the German line was worn down in the Hundred Days of late 1918.',
      armistice: gm ? 'On November 11, 1918, Germany signed the Armistice. The army was still on French soil, but it was exhausted, the blockade had starved the home front, and revolution was spreading.'
        : 'The guns fall silent at eleven o\'clock. Neither side broke the other; the war ended mostly through exhaustion. Most commanders ended exactly where you did.',
      collapse: gm ? 'Morale has broken. In 1918 hunger, the Allied blockade and revolution at home, beginning with the Kiel mutiny, forced the Kaiser to abdicate.'
        : 'Morale has broken. In 1917 French soldiers mutinied after the Nivelle Offensive and Russia collapsed into revolution as the war\'s cost became unbearable.',
    };
    const comparisons = [
      'On the first day of the Battle of the Somme (July 1, 1916), the British suffered about 57,000 casualties' + (men ? '. ' + (men >= 57000 ? 'Your losses were ' + (men / 57000).toFixed(1) + ' times that.' : 'Your losses were about ' + Math.round(men / 57000 * 100) + '% of that.') : '.'),
      'The Battle of Verdun (1916) cost roughly 700,000 casualties on both sides for almost no change in the front line.',
      per ? 'You paid about ' + per.toLocaleString() + ' casualties per square gained.' : gained > 0 ? 'You gained ' + pl(gained, 'square') + ' without casualties, a tiny gain. Surviving in the trenches is not the same as winning.' : 'You gained no ground at all. Surviving in the trenches is not the same as winning.',
    ];

    // key moments, in order, plus the worst turn
    const moments = (g.moments || []).slice();
    if (st.worst && st.worst.men > 0) moments.push({ key: 'worst', label: st.worst.label, text: 'Your worst turn: ' + st.worst.men.toLocaleString() + ' men lost, mostly to ' + (st.worst.cause || 'combat').toLowerCase() + '.' });

    const mgShare = causes.filter(c => c.key === 'machinegun' || c.key === 'shelling').reduce((a, c) => a + c.share, 0);
    const questions = [
      { q: 'Defense was stronger than offense. Looking at your attacks, why did the defenders usually have the advantage?',
        data: 'You made ' + pl(st.attacks.made, 'attack') + ' and ' + st.attacks.won + ' succeeded. ' + (causes.length ? pct(mgShare) + ' of your losses came from machine guns and artillery. ' : '') + 'Your soldiers stood in machine-gun fire ' + st.exposedTurns + ' time' + (st.exposedTurns === 1 ? '' : 's') + '.' },
      { q: 'Why did digging in keep your soldiers alive but stop you from winning?',
        data: 'You dug ' + pl(st.digs.allied, 'trench', 'trenches') + ' and the enemy dug ' + st.digs.german + '. You gained ' + pl(gained, 'square') + '.' },
      { q: 'What happened when you tried to go around the enemy (flanking)?',
        data: st.flankMatches ? 'The enemy sent reserves to match you ' + pl(st.flankMatches, 'time') + '.' : 'The enemy never needed to match a flanking move. If you did not try one, what do you think would have happened?' },
      { q: 'When you broke into the enemy line, was that the same as breaking through? What happened next?',
        data: 'You captured ' + pl(st.captures, 'enemy trench square') + '. The enemy counterattacked ' + pl(st.counters, 'time') + '.' },
      { q: 'Which new weapon helped you most, and how did the enemy respond?', data: techLine(g) },
      { q: 'Was the ground you gained worth the cost? What does this tell you about why the war ended the way it did?',
        data: per ? 'You paid ' + per.toLocaleString() + ' casualties for each square gained.' : 'You gained ' + pl(gained, 'square') + ' and lost ' + men.toLocaleString() + ' men.' },
    ];

    return {
      title: titles[type], lead: lead[type], type, me, foe,
      stats: [
        ['Soldiers lost', men.toLocaleString()],
        ['Enemy soldiers lost', (g.gCasualties * C.menPerStrength).toLocaleString()],
        ['Squares of ground gained', gained],
        ['Farthest advance', g.farthest >= 4 ? 'Column ' + 'ABCDEFGHIJKL'[g.farthest] : 'Not past your line'],
        ['Casualties per square', per ? per.toLocaleString() : 'n/a'],
        ['Final morale', Math.round(g.morale)],
      ],
      causes, moments, comparisons, questions,
      meta: { men, gained, per, endLabel: titles[type], side: me === 'Allied' ? 'the Allies' : 'Germany', year: g.year },
    };
  }

  // Plain text a student can paste into a document or an assignment box.
  function report(sum, answers, name) {
    const L = [];
    L.push('WESTERN FRONT: MY RESULTS');
    if (name) L.push('Name: ' + name);
    L.push('I played as ' + sum.meta.side + '. Ending: ' + sum.title + '.');
    L.push('');
    for (const [k, v] of sum.stats) L.push(k + ': ' + v);
    if (sum.causes.length) { L.push(''); L.push('Where my losses came from:'); for (const c of sum.causes) L.push('- ' + c.label + ': ' + c.men.toLocaleString() + ' men (' + pct(c.share) + ')'); }
    if (sum.moments.length) { L.push(''); L.push('Key moments:'); for (const m of sum.moments) L.push('- ' + m.label + ': ' + m.text); }
    L.push(''); L.push('DEBRIEF QUESTIONS');
    sum.questions.forEach((q, i) => {
      L.push(''); L.push((i + 1) + '. ' + q.q); L.push('   My game: ' + q.data); L.push('   My answer: ' + ((answers && answers[i] || '').trim() || '(not answered)'));
    });
    return L.join('\n');
  }

  // Guided first turns (1914) live in coach.js.
  return { CARDS, NOTES, note, moment, card, startYear, endSummary, report, gainedSquares };
})();
