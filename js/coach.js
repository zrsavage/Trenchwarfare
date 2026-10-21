// The "sergeant": plain-language hints and the scripted opening tutorial.
// Returns what to say and which squares to point at, based only on the current state.
globalThis.WF = globalThis.WF || {};

WF.Coach = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, K = WF.Combat, N = WF.Names;

  function firstIdle(g, types) {
    return g.units.find(u => u.side === 'allied' && !u.acted && (!types || types.includes(u.type)));
  }

  // v: the view built by main.js. Returns { text, tone, pulses, pulseEnd }
  function advise(g, v) {
    const sel = v.selected;
    const t = g.tut, E = N.foe(g), EP = N.foeP(g);

    if (g.over) return { text: 'The war is over.', tone: 'info' };

    // ---- scripted opening (1914) ----
    if (g.year === C.startYear && !g.tutorialDone) {
      if (!t.moved) {
        if (!sel || sel.side !== 'allied') {
          const u = g.units.find(x => x.side === 'allied' && x.type === 'infantry' && x.r === 8 && x.c === 3) || firstIdle(g, ['infantry']);
          return { text: 'Welcome, Captain. These are your soldiers (blue circles). <b>Click one to select it.</b>', tone: 'info', pulses: u ? [{ r: u.r, c: u.c }] : [] };
        }
        return { text: 'Good. The glowing squares show where this soldier can walk. <b>Click one ahead of you to advance.</b> Careful: the red striped squares are covered by ' + E + ' machine guns.', tone: 'info',
          pulses: v.reach ? [...v.reach.values()].filter(p => p.c > sel.c).slice(0, 1).map(p => ({ r: p.r, c: p.c })) : [] };
      }
      if (!t.dug) {
        const u = g.units.find(x => x.side === 'allied' && !x.acted && x.type === 'infantry' && !(sel && sel.id === x.id)) || firstIdle(g, ['infantry']);
        if (sel && sel.side === 'allied' && !sel.acted && K.canDig(g, sel)) return { text: 'Soldiers in the open get shot. <b>Press DIG IN</b> to build a trench: it cuts the damage they take by 40% or more.', tone: 'info', pulseDig: true };
        return { text: 'Nice. Now protect another soldier: <b>select it, then press Dig In.</b>', tone: 'info', pulses: u ? [{ r: u.r, c: u.c }] : [] };
      }
      if (!t.ended) return { text: 'Good. Move or dig with the rest if you like. When you are ready, <b>press END TURN.</b> ' + EP + ' move next.', tone: 'info', pulseEnd: true };
      if (!t.attacked && g.turnCount <= 3) {
        const adj = g.units.find(u => u.side === 'allied' && K.attackTargets(g, u).length);
        if (adj && !adj.acted) return { text: 'An enemy is next to your soldier! <b>Select it, then click the red target.</b> Hover over the target first to see the odds.', tone: 'warn', pulses: [{ r: adj.r, c: adj.c }] };
      }
    }

    // Everything below is a one-time tip. Once the player has acted while a tip was showing,
    // it never appears again, so the sergeant disappears when there is nothing left to teach.
    const tip = (key, o) => (g.tips && g.tips[key] ? null : Object.assign({ key }, o));
    const wounded = u => u.side === 'allied' && u.strength < u.max;

    if (v.mode === 'place') return tip('place', { text: 'Click a glowing green square in your rear (bottom of the map) to place the new unit.', tone: 'info' });

    if (sel && sel.side === 'allied') {
      if (sel.broken) return tip('broken', { text: 'This tank broke down. Early tanks failed all the time. It can\'t act this turn.', tone: 'warn' });
      if (sel.acted) return null;
      const danger = v.danger && v.danger.has(sel.id), inTrench = g.map[sel.r][sel.c].trench > 0;
      if (sel.type === 'artillery') return tip('artillery', { text: 'Artillery: <b>click an amber square</b> to shell it. Shells hurt everyone there, wreck wire, and leave craters your own soldiers must cross later.', tone: 'info' });
      if (sel.type === 'gas') return tip('gasunit', { text: 'Gas company: <b>click an amber square</b> for a one-time gas attack on 3 squares. It works best the first time.', tone: 'info' });
      if (sel.type === 'tank') return tip('tank', { text: 'Tanks cross wire and trenches, and machine guns barely scratch them. But they break down often.', tone: 'info' });
      if (sel.type === 'storm') return tip('storm', { text: 'Stormtroopers run <b>past</b> enemy squares instead of stopping. Use them to rush a gold-star rail hub.', tone: 'info' });
      if (wounded(sel)) return tip('heal', { text: 'This unit is <b>wounded</b> (' + sel.strength + ' of ' + sel.max + '). ' + (inTrench ? '<b>Press REST</b> to recover 1,000 men.' : 'Units only heal in a trench. <b>Dig in, then Rest</b> on a later turn.'), tone: 'good' });
      if (danger) return tip('danger', { text: '<b>This unit is under machine-gun fire!</b> Dig in, or pull back out of the red zone.', tone: 'warn' });
      if (K.attackTargets(g, sel).length) return tip('odds', { text: 'Enemy next to you. <b>Hover over the red target to see the odds</b> before you attack. Bad odds? Dig in instead.', tone: 'info' });
      return null;
    }

    const exposed = v.danger ? v.danger.size : 0;
    if (exposed) return tip('danger', { text: '<b>' + exposed + ' of your units ' + (exposed === 1 ? 'is' : 'are') + ' in machine-gun fire</b> (red rings). They will take damage when you end your turn.', tone: 'warn' });
    if (g.units.some(u => wounded(u) && !u.acted && g.map[u.r][u.c].trench > 0)) return tip('heal', { text: 'Some of your soldiers are <b>wounded</b> (green + sign). Select one that is dug in and press <b>Rest</b> to recover 1,000 men.', tone: 'good' });
    if (g.year === 1915 && g.manpower >= 3) return tip('y1915', { text: 'New weapon: <b>gas</b>. Recruit a Gas Company. The first attack is devastating, but the enemy will adapt.', tone: 'good' });
    if (g.year === 1916) return tip('y1916', { text: 'Long Barrage is unlocked for your artillery: heavy damage, but the ' + EP + ' see it coming and send reserves.', tone: 'info' });
    if (g.year === 1917) return tip('y1917', { text: 'Tanks are available. Recruit them, and bombard a square the same turn you attack it: the defenders can\'t use their machine guns.', tone: 'info' });
    if (g.year === 1918) return tip('y1918', { text: 'Stormtroopers can slip past the line. Shell, then send tanks and infantry, then rush a hub with stormtroopers.', tone: 'info' });
    return null;
  }

  return { advise };
})();
