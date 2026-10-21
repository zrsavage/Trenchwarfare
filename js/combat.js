// Attacks, machine-gun fire, bombardment, gas, digging and damage resolution.
globalThis.WF = globalThis.WF || {};

WF.Combat = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, K = C.combat;
  const rnd = () => (WF.rand || Math.random)();
  const sround = x => { const f = Math.floor(x); return f + (rnd() < x - f ? 1 : 0); };
  const SIDE = { allied: 'Allied', german: 'German' };
  const key = (r, c) => r + ',' + c;

  function say(g, text, kind) { g.log.push({ text, kind }); }
  function note(g, k) { if (WF.Years) WF.Years.note(g, k); }
  const cellOf = (g, u) => g.map[u.r][u.c];
  const label = u => M.label(u.r, u.c);

  // Strength lost is casualties (1 point = 1,000 men). Healing never takes them back.
  function lose(g, u, pts) {
    pts = Math.max(0, Math.min(pts, u.strength));
    u.strength -= pts;
    if (u.side === 'allied') {
      g.casualties += pts;
      g.morale = Math.max(0, g.morale - pts * C.morale.perStrength);
    } else g.gCasualties += pts;
    if (u.strength <= 0) g.units = g.units.filter(x => x !== u);
    return pts;
  }

  // Infantry next to a working tank take less damage.
  function guard(g, u) {
    if (u.type !== 'infantry' && u.type !== 'storm') return 1;
    for (const [r, c] of M.neighbors(u.r, u.c)) {
      const n = U.at(g, r, c);
      if (n && n.side === u.side && n.type === 'tank' && !n.broken) return 1 - K.tankProtection;
    }
    return 1;
  }

  const trenchRed = (g, u, ignore) => (ignore ? 0 : K.trenchReduction[cellOf(g, u).trench]);

  function hurt(g, u, raw, ignoreTrench) {
    return lose(g, u, sround(raw * (1 - trenchRed(g, u, ignoreTrench)) * guard(g, u)));
  }

  function adjacentMg(g, def) {
    return M.neighbors(def.r, def.c).some(([r, c]) => {
      const n = U.at(g, r, c);
      return n && n.side === def.side && n.type === 'machinegun';
    });
  }

  // Expected damage both ways, before rounding. Used by the AI and by resolution.
  function estimate(g, att, def) {
    const cell = cellOf(g, def);
    const creeping = g.year >= K.creepingFrom && K.capturers.includes(att.type) &&
      (g.bombarded || []).includes(key(def.r, def.c));
    let defPower = def.strength * K.defMod[def.type] * (1 + K.trenchDefBonus[cell.trench]);
    if (cell.wire) defPower *= 1 + K.wireDefBonus;
    if (adjacentMg(g, def) && !creeping) defPower *= 1 + K.adjacentMgBonus;
    if (att.type === 'tank' && g.counters.antiTank) defPower *= K.antiTankMod;
    const attPower = att.strength * K.atkMod[att.type];
    return {
      toDef: attPower * K.attackDamage * (1 - trenchRed(g, def)) * guard(g, def),
      toAtt: defPower * K.counterDamage * (1 - trenchRed(g, att)) * guard(g, att),
      creeping,
    };
  }

  function attack(g, att, def) {
    const e = estimate(g, att, def);
    const where = label(def), ownAttack = att.side === 'allied';
    const dealt = lose(g, def, sround(e.toDef));
    const taken = lose(g, att, sround(e.toAtt));
    att.acted = true;
    const defDead = !g.units.includes(def), attAlive = g.units.includes(att);

    let captured = false;
    if (defDead && attAlive && K.capturers.includes(att.type)) {
      const hadTrench = g.map[def.r][def.c].trench > 0;
      U.moveTo(g, att, def.r, def.c);
      att.acted = true;
      captured = true;
      if (ownAttack && hadTrench) note(g, 'firstCapture');
    }
    if (ownAttack) {
      if (captured) say(g, 'Your attack on ' + where + ' succeeded. ' + fmt(taken) + ' casualties, ' + fmt(dealt) + ' German.');
      else {
        say(g, 'Your attack on ' + where + ' failed. ' + fmt(taken) + ' casualties, ' + fmt(dealt) + ' German.');
        if (taken >= C.morale.failedOffensiveLoss) {
          g.morale = Math.max(0, g.morale - C.morale.failedOffensiveExtra);
          note(g, 'failedAttack');
        }
      }
      if (e.creeping) note(g, 'creeping');
    } else {
      say(g, 'German attack on ' + where + (captured ? ' succeeded' : ' repulsed') + '. ' + fmt(dealt) + ' Allied casualties, ' + fmt(taken) + ' German.', 'enemy');
    }
    return { dealt, taken, captured };
  }

  const fmt = pts => (pts * C.menPerStrength).toLocaleString();

  // Machine guns fire automatically at the end of their owner's turn.
  function mgFire(g, side) {
    const range = C.ranges.machineGun;
    let total = 0, mine = 0;
    for (const mg of g.units.filter(u => u.type === 'machinegun' && u.side === side)) {
      for (const t of g.units.filter(u => u.side !== side)) {
        if (cellOf(g, t).trench > 0 || M.distance(mg.r, mg.c, t.r, t.c) > range) continue;
        let raw = mg.strength * C.machineGun.damagePerStrength;
        if (t.type === 'tank') raw *= 1 - K.tankMgImmunity;
        total += hurt(g, t, raw, true);
        if (side === 'german') note(g, 'machineGun');
      }
    }
    if (total) {
      if (side === 'german') say(g, 'Machine guns cut down ' + fmt(total) + ' of your men in the open.', 'enemy');
      else say(g, 'Your machine guns cut down ' + fmt(total) + ' Germans in the open.');
    }
    return total;
  }

  function bombard(g, art, tr, tc, kind) {
    const B = C.bombard, cells = [[tr, tc]];
    const long = kind === 'long';
    if (long) for (const n of M.neighbors(tr, tc)) cells.push(n);
    let hits = 0, casual = 0;
    for (const [r, c] of cells) {
      const cell = g.map[r][c], center = r === tr && c === tc;
      const raw = long ? (center ? B.long.damage : B.long.adjacentDamage) : B.short.damage;
      const u = U.at(g, r, c);
      if (u) { casual += hurt(g, u, raw); hits++; }
      if (long || center) cell.wire = false;
      if (long || rnd() < B.short.craterChance) { if (!cell.crater) note(g, 'crater'); cell.crater = true; }
      g.bombarded = g.bombarded || [];
      g.bombarded.push(key(r, c));
    }
    art.acted = true;
    if (long && art.side === 'allied') { g.warn = { r: tr, c: tc }; note(g, 'longBombard'); }
    const w = M.label(tr, tc);
    if (art.side === 'allied') say(g, (long ? 'Long bombardment of ' : 'Bombardment of ') + w + ': ' + fmt(casual) + ' casualties' + (long ? '. The Germans are warned.' : '.'));
    else say(g, 'German guns shell ' + w + '. ' + fmt(casual) + ' casualties.', 'enemy');
    return casual;
  }

  function gas(g, unit, tr, tc) {
    const first = !g.techUsed.gas;
    const dmg = first ? C.gas.firstUse : (g.counters.gasMasks ? C.gas.masked : C.gas.later);
    let casual = 0;
    for (let dr = -C.gas.areaRows; dr <= C.gas.areaRows; dr++) {
      const r = tr + dr;
      if (!M.inBounds(r, tc)) continue;
      const u = U.at(g, r, tc);
      if (u) casual += hurt(g, u, dmg, true);
    }
    g.techUsed.gas = true;
    g.units = g.units.filter(u => u !== unit);       // one-time attack: the company is spent
    say(g, 'Gas attack on ' + M.label(tr, tc) + (first ? ' catches the Germans unprepared. ' : '. ') + fmt(casual) + ' German casualties' + (!first && g.counters.gasMasks ? ' (gas masks limit the effect)' : '') + '.');
    note(g, first ? 'gas' : 'gasMask');
    return casual;
  }

  const DIGGERS = ['infantry', 'machinegun', 'storm'];
  const canDig = (g, u) => DIGGERS.includes(u.type) && cellOf(g, u).trench < 3;

  function dig(g, u) {
    const cell = cellOf(g, u);
    if (!canDig(g, u)) return false;
    cell.trench++;
    if (!cell.dugBy) cell.dugBy = u.side;
    u.acted = true;
    if (u.side === 'allied') {
      if (u.c >= 3 && u.c <= 8) g.digCredits[u.r] = Math.min(3, (g.digCredits[u.r] || 0) + 1);
      note(g, 'firstDig');
    }
    return true;
  }

  function hold(g, u) {
    u.acted = true;
    if (cellOf(g, u).trench > 0 && u.strength < u.max) { u.strength++; return true; }
    return false;
  }

  function tankBreakdowns(g) {
    const p = g.counters.antiTank ? C.tank.breakdownCountered : C.tank.breakdown;
    for (const t of g.units.filter(u => u.type === 'tank' && u.side === 'allied')) {
      t.broken = rnd() < p;
      if (t.broken) { t.acted = true; say(g, 'Tank at ' + label(t) + ' has broken down.'); note(g, 'tankBreak'); }
    }
  }

  const inRange = (u, r, c, range) => M.distance(u.r, u.c, r, c) <= range;
  const attackTargets = (g, u) => M.neighbors(u.r, u.c).map(([r, c]) => U.at(g, r, c))
    .filter(t => t && t.side !== u.side);

  return { lose, hurt, estimate, attack, mgFire, bombard, gas, dig, hold, canDig, tankBreakdowns,
           inRange, attackTargets, say, key };
})();
