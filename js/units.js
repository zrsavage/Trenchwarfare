// Unit types, creation, and movement rules.
globalThis.WF = globalThis.WF || {};

// Animation events: the renderer replays these. Harmless when game.events is absent (tests).
WF.emit = function (g, ev) { if (g && g.events) g.events.push(ev); };

// Who is who. Internally the human is always side 'allied' and the computer 'german'
// (so the rules only exist once); g.player says which real army the human commands.
WF.Names = {
  faction(g, side) { const p = (g && g.player) || 'allied'; return side === 'allied' ? p : (p === 'allied' ? 'german' : 'allied'); },
  adj(g, side) { return this.faction(g, side) === 'allied' ? 'Allied' : 'German'; },
  plural(g, side) { return this.faction(g, side) === 'allied' ? 'Allies' : 'Germans'; },
  me(g) { return this.adj(g, 'allied'); }, foe(g) { return this.adj(g, 'german'); },
  meP(g) { return this.plural(g, 'allied'); }, foeP(g) { return this.plural(g, 'german'); },
};

WF.Units = (function () {
  const C = WF.CONFIG;
  const M = WF.Map;
  const EPS = 1e-9;

  function create(game, type, side, r, c, strength) {
    const def = C.units[type];
    const s = Math.min(C.maxStrength, strength || def.startStrength);
    const unit = { id: game.nextId++, type, side, r, c, strength: s, max: s, acted: false, broken: false };
    game.units.push(unit);
    return unit;
  }

  function placeStartingForces(game) {
    for (const f of C.startingForces.allied) create(game, f.t, 'allied', f.r, f.c, f.s);
    for (const f of C.startingForces.german) create(game, f.t, 'german', f.r, f.c, f.s);
  }

  const at = (game, r, c) => game.units.find(u => u.r === r && u.c === c) || null;
  const byId = (game, id) => game.units.find(u => u.id === id) || null;
  const isAvailable = (type, year) => C.units[type].year <= year;
  const enemyOf = side => (side === 'allied' ? 'german' : 'allied');
  const forwardDir = side => (side === 'allied' ? 1 : -1);   // column direction toward the enemy

  // Squares a unit can reach this turn -> { cost, r, c }. Rules:
  //  - orthogonal steps; enemy squares block, friendly squares can be passed but not ended on
  //  - craters cost extra, and a unit that cannot afford one may still enter it as its first step
  //  - wire ends the move (tanks crush it); leaving a trench toward the enemy allows one square
  //  - German units move along the rail line at move/rail.squaresPerTurn per square
  //  - stormtroopers can pass through enemy squares (infiltration) but not stop on them
  function reachable(game, unit) {
    const move = C.units[unit.type].move;
    const dir = forwardDir(unit.side);
    const isTank = unit.type === 'tank', isStorm = unit.type === 'storm';
    const railStep = move / C.rail.squaresPerTurn;
    const best = new Map();
    const key = (r, c) => r + ',' + c;
    const start = { cost: 0, stop: false, r: unit.r, c: unit.c };
    best.set(key(unit.r, unit.c), start);
    const open = [start];

    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const cur = open.shift();
      if (cur.stop || cur.cost >= move - EPS) continue;
      const from = game.map[cur.r][cur.c];

      for (const [nr, nc] of M.neighbors(cur.r, cur.c)) {
        const occ = at(game, nr, nc);
        if (occ && occ.side !== unit.side && !isStorm) continue;
        const to = game.map[nr][nc];

        let step = to.crater ? C.movement.craterCost : to.trench ? C.movement.trenchCost : C.movement.openCost;
        if (unit.side === 'german' && from.rail && to.rail && !to.crater) step = railStep;
        else if (to.crater && cur.cost > 0 && cur.cost + step > move + EPS) continue;
        let stop = false;
        if (to.wire && C.movement.wireEndsMove && !isTank) { step = move - cur.cost; stop = true; }
        if (!isTank && from.trench > 0 && to.trench === 0 && (nc - cur.c) * dir > 0) stop = true;

        const cost = Math.min(move, cur.cost + step);
        const k = key(nr, nc);
        const prev = best.get(k);
        if (!prev || cost < prev.cost - EPS || (Math.abs(cost - prev.cost) < EPS && prev.stop && !stop)) {
          const node = { cost, stop, r: nr, c: nc };
          best.set(k, node);
          open.push(node);
        }
      }
    }

    const result = new Map();
    for (const [k, n] of best) {
      if (n.r === unit.r && n.c === unit.c) continue;
      if (at(game, n.r, n.c)) continue;           // cannot end on an occupied square
      result.set(k, { cost: Math.round(n.cost * 100) / 100, r: n.r, c: n.c });
    }
    return result;
  }

  function claim(game, side, r, c) {
    game.owner[r][c] = side === 'allied' ? 'a' : 'g';
    if (side === 'allied' && c > (game.farthest || 0)) game.farthest = c;
  }

  function moveTo(game, unit, r, c) {
    unit.r = r; unit.c = c;
    unit.acted = true;
    if (unit.type === 'tank') game.map[r][c].wire = false;
    if (unit.type !== 'artillery' && unit.type !== 'gas') claim(game, unit.side, r, c);
  }

  // Open squares an enemy machine gun can currently fire into (red tint in the UI).
  // `side` is the side whose units would be hit.
  function killZone(game, side) {
    const zone = new Set();
    const range = C.ranges.machineGun;
    for (const mg of game.units) {
      if (mg.type !== 'machinegun' || mg.side === side) continue;
      for (let r = mg.r - range; r <= mg.r + range; r++) {
        for (let c = mg.c - range; c <= mg.c + range; c++) {
          if (!M.inBounds(r, c) || M.distance(mg.r, mg.c, r, c) > range) continue;
          if (r === mg.r && c === mg.c) continue;
          if (game.map[r][c].trench === 0) zone.add(r + ',' + c);
        }
      }
    }
    return zone;
  }

  const men = u => u.strength * C.menPerStrength;

  return { create, placeStartingForces, at, byId, isAvailable, enemyOf, forwardDir,
           reachable, moveTo, claim, killZone, men };
})();
