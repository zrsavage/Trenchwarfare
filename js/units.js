// Unit types, creation, and movement rules.
globalThis.WF = globalThis.WF || {};

WF.Units = (function () {
  const C = WF.CONFIG;
  const M = WF.Map;

  function create(game, type, side, r, c, strength) {
    const def = C.units[type];
    const unit = {
      id: game.nextId++, type, side, r, c,
      strength: Math.min(C.maxStrength, strength || def.startStrength),
      acted: false,
    };
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

  // Squares a unit can reach this turn -> { cost }. Rules:
  //  - orthogonal steps; enemy squares block, friendly squares can be passed but not ended on
  //  - craters cost extra, and a unit that cannot afford one may still enter it as its first step
  //  - wire ends the move
  //  - leaving a trench toward the enemy ("over the top") allows only one square
  function reachable(game, unit) {
    const move = C.units[unit.type].move;
    const dir = forwardDir(unit.side);
    const best = new Map();                       // key -> { cost, stop }
    const key = (r, c) => r + ',' + c;
    best.set(key(unit.r, unit.c), { cost: 0, stop: false, r: unit.r, c: unit.c });
    const open = [best.get(key(unit.r, unit.c))];

    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const cur = open.shift();
      if (cur.stop || cur.cost >= move) continue;
      const from = game.map[cur.r][cur.c];

      for (const [nr, nc] of M.neighbors(cur.r, cur.c)) {
        const occ = at(game, nr, nc);
        if (occ && occ.side !== unit.side) continue;
        const to = game.map[nr][nc];

        let step = to.crater ? C.movement.craterCost : to.trench ? C.movement.trenchCost : C.movement.openCost;
        if (to.crater && cur.cost > 0) { if (cur.cost + step > move) continue; }
        let stop = false;
        if (to.wire && C.movement.wireEndsMove) { step = move - cur.cost; stop = true; }
        const overTheTop = from.trench > 0 && to.trench === 0 && (nc - cur.c) * dir > 0;
        if (overTheTop) stop = true;

        const cost = Math.min(move, cur.cost + step);
        const k = key(nr, nc);
        const prev = best.get(k);
        if (!prev || cost < prev.cost || (cost === prev.cost && prev.stop && !stop)) {
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
      result.set(k, { cost: n.cost, r: n.r, c: n.c });
    }
    return result;
  }

  function moveTo(game, unit, r, c) {
    unit.r = r; unit.c = c;
    unit.acted = true;
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
           reachable, moveTo, killZone, men };
})();
