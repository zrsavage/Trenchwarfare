// The "sergeant": plain-language hints and the scripted opening tutorial.
// Returns what to say and which squares to point at, based only on the current state.
globalThis.WF = globalThis.WF || {};

WF.Coach = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, K = WF.Combat;

  function firstIdle(g, types) {
    return g.units.find(u => u.side === 'allied' && !u.acted && (!types || types.includes(u.type)));
  }

  // v: the view built by main.js. Returns { text, tone, pulses, pulseEnd }
  function advise(g, v) {
    const sel = v.selected, idle = g.units.filter(u => u.side === 'allied' && !u.acted && !u.broken).length;
    const t = g.tut;

    if (g.over) return { text: 'The war is over.', tone: 'info' };

    // ---- scripted opening (1914) ----
    if (g.year === C.startYear && !g.tutorialDone) {
      if (!t.moved) {
        if (!sel || sel.side !== 'allied') {
          const u = g.units.find(x => x.side === 'allied' && x.type === 'infantry' && x.r === 8 && x.c === 3) || firstIdle(g, ['infantry']);
          return { text: 'Welcome, Captain. These are your soldiers (blue circles). <b>Click one to select it.</b>', tone: 'info', pulses: u ? [{ r: u.r, c: u.c }] : [] };
        }
        return { text: 'Good. The glowing squares show where this soldier can walk. <b>Click one ahead of you to advance.</b> Careful: the red striped squares are covered by German machine guns.', tone: 'info',
          pulses: v.reach ? [...v.reach.values()].filter(p => p.c > sel.c).slice(0, 1).map(p => ({ r: p.r, c: p.c })) : [] };
      }
      if (!t.dug) {
        const u = g.units.find(x => x.side === 'allied' && !x.acted && x.type === 'infantry' && !(sel && sel.id === x.id)) || firstIdle(g, ['infantry']);
        if (sel && sel.side === 'allied' && !sel.acted && K.canDig(g, sel)) return { text: 'Soldiers in the open get shot. <b>Press DIG IN</b> to build a trench: it cuts the damage they take by 40% or more.', tone: 'info', pulseDig: true };
        return { text: 'Nice. Now protect another soldier: <b>select it, then press Dig In.</b>', tone: 'info', pulses: u ? [{ r: u.r, c: u.c }] : [] };
      }
      if (!t.ended) return { text: 'Good. Move or dig with the rest if you like. When you are ready, <b>press END TURN.</b> The Germans move next.', tone: 'info', pulseEnd: true };
      if (!t.attacked && g.turnCount <= 3) {
        const adj = g.units.find(u => u.side === 'allied' && K.attackTargets(g, u).length);
        if (adj && !adj.acted) return { text: 'An enemy is next to your soldier! <b>Select it, then click the red target.</b> Hover over the target first to see the odds.', tone: 'warn', pulses: [{ r: adj.r, c: adj.c }] };
      }
    }

    // ---- placing recruits ----
    if (v.mode === 'place') return { text: 'Click a glowing green square in your rear (bottom of the map) to place the new unit.', tone: 'info' };

    // ---- selected unit ----
    if (sel && sel.side === 'allied') {
      if (sel.broken) return { text: 'This tank broke down. Early tanks failed all the time. It can\'t act this turn.', tone: 'warn' };
      if (sel.acted) return { text: 'This unit has already acted this turn. Pick another, or End Turn.', tone: 'info' };
      const danger = v.danger && v.danger.has(sel.id);
      if (sel.type === 'artillery') return { text: 'Artillery: <b>click an amber square</b> to shell it. Shells hurt everyone there, wreck wire, and leave craters your own soldiers must cross later.', tone: 'info' };
      if (sel.type === 'gas') return { text: 'Gas company: <b>click an amber square</b> for a one-time gas attack on 3 squares. It works best the first time.', tone: 'info' };
      if (sel.type === 'tank') return { text: 'Tanks cross wire and trenches, and machine guns barely scratch them. But they break down often.', tone: 'info' };
      if (sel.type === 'storm') return { text: 'Stormtroopers run <b>past</b> enemy squares instead of stopping. Use them to rush a gold-star rail hub.', tone: 'info' };
      if (danger) return { text: '<b>This unit is under machine-gun fire!</b> Dig in, or pull back out of the red zone.', tone: 'warn' };
      if (K.attackTargets(g, sel).length) return { text: 'Enemy next to you. <b>Hover over the red target to see the odds</b> before you attack. Bad odds? Dig in instead.', tone: 'info' };
      return { text: 'Click a glowing square to move, or use the buttons below to dig in or rest.', tone: 'info' };
    }

    // ---- nothing selected: strategy nudges ----
    const exposed = v.danger ? v.danger.size : 0;
    if (exposed) return { text: '<b>' + exposed + ' of your units ' + (exposed === 1 ? 'is' : 'are') + ' in machine-gun fire</b> (red rings). They will take damage when you end your turn.', tone: 'warn' };
    if (g.manpower >= 4 && g.units.filter(u => u.side === 'allied').length < 14 && g.turn === 1) return { text: 'You have new recruits available. Use <b>Reinforcements</b> to add units to your rear.', tone: 'good' };
    if (g.year === 1915 && !g.techUsed.gas && g.manpower >= 3) return { text: 'New weapon: <b>gas</b>. Recruit a Gas Company. The first attack is devastating, but the enemy will adapt.', tone: 'good' };
    if (g.year === 1916) return { text: 'Long Barrage is unlocked for your artillery: heavy damage, but the Germans see it coming and send reserves.', tone: 'info' };
    if (g.year === 1917) return { text: 'Tanks are available. Recruit them, and bombard a square the same turn you attack it: the defenders can\'t use their machine guns.', tone: 'info' };
    if (g.year === 1918) return { text: 'Stormtroopers can slip past the line. Shell, then send tanks and infantry, then rush a hub with stormtroopers.', tone: 'info' };
    if (idle > 0) return { text: 'Your goal: capture a gold-star <b>rail hub</b> behind the German lines and hold it. Click a unit to begin, or End Turn.', tone: 'info' };
    return { text: 'All units have acted. <b>Press End Turn.</b>', tone: 'good', pulseEnd: true };
  }

  return { advise };
})();
