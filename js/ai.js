// The computer opponent. Simple, readable rules:
// mirror digging, extend the line, reserves by rail, defend first.
globalThis.WF = globalThis.WF || {};

WF.AI = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, K = WF.Combat, A = C.ai, N = WF.Names;
  const stat = g => K.stat(g);
  const aggr = g => A.aggression[N.faction(g, 'german')] || 0;
  const offTurns = g => (g.player === 'german' ? A.offensiveTurnsVsGerman : A.offensiveTurns);
  const rnd = () => (WF.rand || Math.random)();
  const germans = g => g.units.filter(u => u.side === 'german');
  const allies = g => g.units.filter(u => u.side === 'allied');
  const FIGHTERS = ['infantry', 'storm', 'tank'];
  const isReserve = u => u.type === 'infantry' && u.c >= 9;
  const free = u => !u.acted;

  function note(g, k) { if (WF.Years) WF.Years.note(g, k); }

  // Move a unit to the reachable square closest to (tr, tc). Returns true if it moved.
  function moveToward(g, u, tr, tc) {
    const reach = U.reachable(g, u);
    let bestD = M.distance(u.r, u.c, tr, tc), pick = null;
    for (const sq of reach.values()) {
      const d = M.distance(sq.r, sq.c, tr, tc);
      if (d < bestD || (d === bestD && pick && g.map[sq.r][sq.c].trench > g.map[pick.r][pick.c].trench)) {
        bestD = d; pick = sq;
      }
    }
    if (!pick) return false;
    U.moveTo(g, u, pick.r, pick.c);
    return true;
  }

  function trenchGoal(g) { return A.trenchGoalByYear[g.year] || 1; }

  function digIn(g, u) {
    if (!K.canDig(g, u)) return false;
    return K.dig(g, u);
  }

  // Each unit with a mission walks (or rides the rail) to its square, then digs in.
  function runMission(g, u) {
    const m = u.mission;
    if (!m || u.acted) return;
    if (u.r === m.r && u.c === m.c) {
      if (g.map[u.r][u.c].trench < Math.max(1, m.level || 1) && digIn(g, u)) return;
      u.mission = null;
      return;
    }
    if (!moveToward(g, u, m.r, m.c)) { u.mission = null; return; }
    if (u.r === m.r && u.c === m.c && g.map[u.r][u.c].trench < (m.level || 1)) digIn(g, u);
  }

  function missionSquare(g, row) {
    for (const c of [8, 7, 9, 6, 10]) if (!U.at(g, row, c)) return { r: row, c };
    return { r: row, c: 8 };
  }

  function pickReserve(g, row) {
    const cands = germans(g).filter(u => u.type === 'infantry' && free(u) && !u.mission);
    let best = null, bestScore = Infinity;
    for (const u of cands) {
      const cell = g.map[u.r][u.c];
      if (!isReserve(u) && cell.trench > 0) continue;          // leave dug-in front units alone
      if (U.reachable(g, u).size === 0) continue;
      const score = (isReserve(u) ? 0 : 40) + Math.abs(u.r - row) * (isReserve(u) ? 0.5 : 1);
      if (score < bestScore) { bestScore = score; best = u; }
    }
    return best;
  }

  const rowCovered = (g, r) => germans(g).some(u =>
    (u.type === 'infantry' || u.type === 'machinegun') && Math.abs(u.r - r) <= 1 && u.c >= 4 &&
    (g.map[u.r][u.c].trench > 0 || (u.mission && Math.abs(u.mission.r - r) <= 1)));

  // Allied units in a row with no German trench facing them: send a reserve and dig.
  function extendLine(g) {
    const rows = [...new Set(allies(g).filter(u => u.c >= 4 && u.type !== 'artillery').map(u => u.r))];
    let sent = 0;
    for (const r of rows) {
      if (sent >= A.maxExtendPerTurn) break;
      if (rowCovered(g, r)) continue;
      // A German front unit already in the neighbourhood just digs where it stands.
      const local = germans(g).find(u => free(u) && !u.mission && (u.type === 'infantry' || u.type === 'machinegun') &&
        Math.abs(u.r - r) <= 1 && u.c >= 4 && u.c <= 9 && g.map[u.r][u.c].trench === 0);
      if (local) { digIn(g, local); continue; }
      const res = pickReserve(g, r);
      if (!res) continue;
      const sq = missionSquare(g, r);
      res.mission = { r: sq.r, c: sq.c, level: 1 };
      runMission(g, res);
      sent++; stat(g).flankMatches++;
      K.say(g, N.foe(g) + ' reserves ride the rail to ' + M.label(sq.r, sq.c) + ' to face your men.', 'enemy', 'When you moved toward an undefended stretch, the enemy rushed reserves there by rail and dug in. Both armies kept trying to go around each other until the trenches reached the Channel and Switzerland. This was the Race to the Sea.');
      if (Math.abs(res.r - r) > 2 || isReserve(res)) note(g, 'extend');
    }
  }

  // For every trench the player digs, the facing German square is dug on the next turn.
  function mirrorDig(g) {
    for (const r of Object.keys(g.digCredits)) {
      const row = +r;
      while (g.digCredits[row] > 0) {
        const u = germans(g).filter(x => free(x) && !x.mission && (x.type === 'infantry' || x.type === 'machinegun') &&
          x.r === row && x.c >= 4 && x.c <= 10 && K.canDig(g, x)).sort((a, b) => a.c - b.c)[0];
        if (!u) {
          const res = pickReserve(g, row);
          if (res) { const sq = missionSquare(g, row); res.mission = { r: sq.r, c: sq.c, level: 1 }; runMission(g, res); }
          g.digCredits[row] = 0;
          break;
        }
        K.dig(g, u);
        g.digCredits[row]--;
        stat(g).mirrors++;
        K.say(g, N.foe(g) + ' troops dig in at ' + M.label(u.r, u.c) + ', facing your trench.', 'enemy', 'You dug a trench, so they dug one facing it. Once both sides were dug in, neither could gain a lasting edge, and the front froze.');
        note(g, 'mirror');
      }
    }
  }

  // Front units dig in by themselves as the war settles down.
  function baselineDig(g) {
    const early = g.year === C.startYear && g.turnCount < A.baselineDigTurn;
    if (early) return;
    for (const u of germans(g)) {
      if (!free(u) || u.mission || u.c < 4 || u.c > 9) continue;
      if (u.type !== 'infantry' && u.type !== 'machinegun') continue;
      if (g.map[u.r][u.c].trench < trenchGoal(g)) digIn(g, u);
    }
  }

  function captured(g) {
    return allies(g).filter(u => g.map[u.r][u.c].hub || g.map[u.r][u.c].dugBy === 'german')
      .sort((a, b) => (g.map[b.r][b.c].hub ? 1 : 0) - (g.map[a.r][a.c].hub ? 1 : 0));
  }

  // Reserves ride the rail to the gap and counterattack.
  function counterattack(g, ctx) {
    for (const target of captured(g)) {
      if (!g.units.includes(target)) continue;
      const hub = g.map[target.r][target.c].hub;
      note(g, 'counter'); stat(g).counters++;
      K.say(g, N.foe(g) + ' reserves rush to retake ' + M.label(target.r, target.c) + '.', 'enemy', 'Their reserves travelled by rail in hours, while your soldiers had to cross craters and mud on foot. Breaking into the line was not the same as breaking through it.');
      for (const u of germans(g).filter(x => free(x) && FIGHTERS.includes(x.type) && M.distance(x.r, x.c, target.r, target.c) === 1)) {
        if (g.units.includes(target)) K.attack(g, u, target);
      }
      if (!g.units.includes(target)) continue;
      const reserves = germans(g).filter(x => x.type === 'infantry' && free(x) && !x.mission && M.distance(x.r, x.c, target.r, target.c) > 1)
        .sort((a, b) => (isReserve(b) ? 1 : 0) - (isReserve(a) ? 1 : 0) || M.distance(a.r, a.c, target.r, target.c) - M.distance(b.r, b.c, target.r, target.c));
      for (const u of reserves) {
        if (ctx.cap <= 0) break;
        if (!g.units.includes(target)) break;
        if (!isReserve(u) && M.distance(u.r, u.c, target.r, target.c) > 6) continue;
        ctx.cap--;
        moveToward(g, u, target.r, target.c);
        if (hub && A.hubReserveAttacksSameTurn && M.distance(u.r, u.c, target.r, target.c) === 1) K.attack(g, u, target);
      }
    }
  }

  // Attacks an adjacent unit if the trade is good enough. A more aggressive army accepts worse odds
  // and will hit units in a shallow trench too.
  function opportunistic(g) {
    const ag = aggr(g), ratio = Math.max(0.5, A.attackRatio - 0.5 * ag);
    for (const u of germans(g).filter(x => free(x) && (x.type === 'infantry' || x.type === 'storm'))) {
      if (!g.units.includes(u)) continue;
      const t = K.attackTargets(g, u).find(x => g.map[x.r][x.c].trench === 0 || (ag >= 0.6 && g.map[x.r][x.c].trench === 1));
      if (!t) continue;
      const e = K.estimate(g, u, t);
      if (e.toDef >= e.toAtt * ratio && e.toDef >= 1) K.attack(g, u, t);
    }
  }

  // A local offensive (Ypres, Verdun, the Somme, Arras...): shell one sector, then send
  // several units at it. Usually costs the attacker more than the defender.
  function push(g) {
    const ag = aggr(g);
    const targets = allies(g).filter(u => u.type !== 'artillery' && u.type !== 'gas')
      .sort((a, b) => (g.map[a.r][a.c].trench - g.map[b.r][b.c].trench) || (b.c - a.c));
    const target = targets[0];
    if (!target) return;
    const where = M.label(target.r, target.c);
    K.say(g, N.foe(g) + ' launches an attack near ' + where + '.', 'enemy',
      'Both armies launched local offensives to gain ground or relieve pressure elsewhere. Attacking across open ground against defenders who had dug in usually cost the attackers more men than the defenders.');
    for (const art of germans(g).filter(u => u.type === 'artillery' && free(u))) {
      if (!K.inRange(art, target.r, target.c, C.ranges.artillery)) continue;
      K.bombard(g, art, target.r, target.c, g.year >= C.bombard.long.unlockYear && ag > 0.5 ? 'long' : 'short');
    }
    const n = Math.min(5, Math.round(A.pushUnits + 3 * ag));
    const pool = germans(g).filter(u => free(u) && FIGHTERS.includes(u.type) && !isReserve(u))
      .sort((a, b) => M.distance(a.r, a.c, target.r, target.c) - M.distance(b.r, b.c, target.r, target.c)).slice(0, n);
    for (const u of pool) {
      if (!g.units.includes(u) || u.acted) continue;
      u.mission = null;
      const adj = K.attackTargets(g, u);
      if (adj.length) { K.attack(g, u, adj.find(x => x === target) || adj.sort((a, b) => a.strength - b.strength)[0]); continue; }
      moveToward(g, u, target.r, target.c);
    }
  }

  function artillery(g, heavy) {
    for (const art of germans(g).filter(u => u.type === 'artillery' && free(u))) {
      if (!heavy && rnd() > Math.min(1, A.artilleryChance + 0.3 * aggr(g))) continue;
      const targets = allies(g).filter(t => K.inRange(art, t.r, t.c, C.ranges.artillery));
      if (!targets.length) continue;
      targets.sort((a, b) => (g.map[a.r][a.c].trench - g.map[b.r][b.c].trench) || (b.strength - a.strength));
      K.bombard(g, art, targets[0].r, targets[0].c, heavy ? 'long' : 'short');
    }
  }

  // Spring 1918: one big offensive, then the reserves run dry.
  function offensive(g) {
    note(g, 'offensive');
    if (!g.offensiveSaid) { g.offensiveSaid = true; K.say(g, N.foe(g) + ' launches a major offensive!', 'enemy', g.player === 'german' ? 'In August 1918 the Allies attacked at Amiens with tanks, infantry and aircraft. It was called the black day of the German army.' : 'In March 1918 Germany attacked with stormtroopers before the Americans could arrive in force. It gained ground quickly, then ran out of reserves.'); }
    artillery(g, true);
    for (const u of germans(g).filter(x => free(x) && (x.type === 'infantry' || x.type === 'storm') && x.c <= 9)) {
      if (!g.units.includes(u)) continue;
      u.mission = null;
      const adj = K.attackTargets(g, u);
      if (adj.length) { K.attack(g, u, adj.sort((a, b) => a.strength - b.strength)[0]); continue; }
      const t = allies(g).sort((a, b) => M.distance(u.r, u.c, a.r, a.c) - M.distance(u.r, u.c, b.r, b.c))[0];
      if (t) moveToward(g, u, t.r, t.c);
    }
  }

  function exhaust(g) {
    g.exhaustion = (g.exhaustion || 0) + 1;
    for (const u of germans(g).filter(x => x.type === 'infantry' && x.c >= 9 && x.strength > A.exhaustFloor)) K.lose(g, u, 1);
    K.say(g, N.foe(g) + ' reserves are running thin.', 'enemy', 'A big offensive uses up men and supplies. After it, the attacker has fewer reserves left, which is why late 1918 finally allowed a breakthrough.');
    note(g, 'exhausted');
  }

  function takeTurn(g) {
    for (const u of germans(g)) u.acted = false;
    const ctx = { cap: Math.max(A.minReserveCap, A.reserveCap - (g.exhaustion || 0)) };
    const isOffensive = g.year === A.offensiveYear && offTurns(g).includes(g.turn);
    const afterOffensive = g.year === A.offensiveYear && g.turn > Math.max(...offTurns(g));

    if (isOffensive) offensive(g);
    else {
      // A long bombardment tells the Germans where the blow will fall.
      if (g.warn) {
        const row = g.warn.r;
        for (const res of germans(g).filter(u => isReserve(u) && free(u) && !u.mission).sort((a, b) => Math.abs(a.r - row) - Math.abs(b.r - row)).slice(0, 2)) {
          const sq = missionSquare(g, row);
          res.mission = { r: sq.r, c: sq.c, level: 2 };
          runMission(g, res);
        }
        K.say(g, N.foe(g) + ' reserves move toward ' + M.label(g.warn.r, g.warn.c) + '.', 'enemy', 'Your long bombardment warned them where the attack would come, so they sent reserves there. Before the Somme, a week of shelling did the same.');
        g.warn = null;
      }
      const pushTurn = ((A.pushes[N.faction(g, 'german')] || {})[g.year] || []).includes(g.turn);
      if (pushTurn) push(g);
      for (const u of germans(g)) runMission(g, u);
      counterattack(g, ctx);
      mirrorDig(g);
      extendLine(g);
      baselineDig(g);
      opportunistic(g);
      artillery(g, false);
    }
    if (isOffensive && g.turn === Math.max(...offTurns(g))) g.exhaustion = 1;
    else if (afterOffensive || (g.exhaustion > 0)) exhaust(g);
  }

  return { takeTurn, moveToward };
})();
