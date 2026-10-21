// Attacks, machine-gun fire, bombardment, gas, digging and damage resolution.
globalThis.WF = globalThis.WF || {};

WF.Combat = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, K = C.combat;
  const rnd = () => (WF.rand || Math.random)();
  const sround = x => { const f = Math.floor(x); return f + (rnd() < x - f ? 1 : 0); };
  const key = (r, c) => r + ',' + c;

  function say(g, text, kind, why) { g.log.push({ text, kind, why }); }
  const N = WF.Names;
  function stat(g) { return g.stats || (g.stats = { lost: { allied: {}, german: {} }, attacks: { made: 0, won: 0 }, digs: { allied: 0, german: 0 }, flankMatches: 0, counters: 0, captures: 0, exposedTurns: 0, shells: 0, mirrors: 0, worst: { men: 0 }, turnCauses: {} }); }
  const pct = r => Math.round(r * 100) + '%';
  function note(g, k) { if (WF.Years) WF.Years.note(g, k); }
  const cellOf = (g, u) => g.map[u.r][u.c];
  const label = u => M.label(u.r, u.c);

  // Strength lost is casualties (1 point = 1,000 men). Healing never takes them back.
  function lose(g, u, pts, cause) {
    pts = Math.max(0, Math.min(pts, u.strength));
    u.strength -= pts;
    if (pts > 0) WF.emit(g, { t: 'hit', id: u.id, r: u.r, c: u.c, n: pts, side: u.side });
    if (u.strength <= 0) WF.emit(g, { t: 'die', id: u.id });
    const st = stat(g), cz = cause || 'other';
    st.lost[u.side][cz] = (st.lost[u.side][cz] || 0) + pts;
    if (u.side === 'allied') { st.turnCauses[cz] = (st.turnCauses[cz] || 0) + pts; }
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

  function hurt(g, u, raw, ignoreTrench, cause) {
    return lose(g, u, sround(raw * (1 - trenchRed(g, u, ignoreTrench)) * guard(g, u)), cause);
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
    WF.emit(g, { t: 'melee', a: att.id, from: { r: att.r, c: att.c }, to: { r: def.r, c: def.c } });
    const defCell = cellOf(g, def), defTrench = defCell.trench, defWire = defCell.wire, defMg = adjacentMg(g, def), attOpen = cellOf(g, att).trench === 0;
    const dealt = lose(g, def, sround(e.toDef), 'assault');
    const taken = lose(g, att, sround(e.toAtt), 'assault');
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
    const st = stat(g);
    const why = attackWhy({ defTrench, defWire, defMg, attOpen, creeping: e.creeping, captured, ownAttack, dealt, taken });
    if (ownAttack) {
      st.attacks.made++; if (captured) st.attacks.won++;
      if (captured) say(g, 'Your attack on ' + where + ' succeeded. You lost ' + fmt(taken) + ', they lost ' + fmt(dealt) + '.', '', why);
      else {
        say(g, 'Your attack on ' + where + ' failed. You lost ' + fmt(taken) + ', they lost ' + fmt(dealt) + '.', '', why);
        if (taken >= C.morale.failedOffensiveLoss) {
          g.morale = Math.max(0, g.morale - C.morale.failedOffensiveExtra);
          note(g, 'failedAttack');
        }
      }
      if (e.creeping) note(g, 'creeping');
      if (captured && defTrench > 0) st.captures++;
    } else {
      say(g, N.foe(g) + ' attack on ' + where + (captured ? ' succeeded' : ' was repulsed') + '. You lost ' + fmt(dealt) + ', they lost ' + fmt(taken) + '.', 'enemy', why);
    }
    return { dealt, taken, captured };
  }

  const fmt = pts => (pts * C.menPerStrength).toLocaleString();

  // One plain sentence explaining why a fight went the way it did.
  function attackWhy(o) {
    const bits = [];
    if (o.defTrench) bits.push('the defenders were in a level ' + o.defTrench + ' trench, which absorbed ' + pct([0, .4, .6, .8][o.defTrench]) + ' of the damage');
    if (o.defWire) bits.push('barbed wire slowed the attackers');
    if (o.defMg) bits.push('a machine gun next to the defenders fired on the attackers');
    if (o.creeping) bits.push('a creeping barrage had pinned the defenders down, so their machine guns could not help');
    if (o.attOpen) bits.push('the attackers were out in the open');
    const head = o.ownAttack ? (o.captured ? 'You won because ' : 'You lost more men because ') : (o.captured ? 'They won because ' : 'The attack failed because ');
    if (!bits.length) return head + 'the two sides were evenly matched.';
    const ending = !o.captured ? ' Defense was stronger than offense.' : ' Even so, winning one square cost many lives.';
    return head + bits.join(', and ') + '.' + ending;
  }

  // Machine guns fire automatically at the end of their owner's turn.
  function mgFire(g, side) {
    const range = C.ranges.machineGun;
    let total = 0, mine = 0;
    for (const mg of g.units.filter(u => u.type === 'machinegun' && u.side === side)) {
      for (const t of g.units.filter(u => u.side !== side)) {
        if (cellOf(g, t).trench > 0 || M.distance(mg.r, mg.c, t.r, t.c) > range) continue;
        WF.emit(g, { t: 'mg', from: { r: mg.r, c: mg.c }, to: { r: t.r, c: t.c } });
        let raw = mg.strength * C.machineGun.damagePerStrength;
        if (t.type === 'tank') raw *= 1 - K.tankMgImmunity;
        total += hurt(g, t, raw, true, 'machinegun');
        if (side === 'german') note(g, 'machineGun');
      }
    }
    if (total) {
      if (side === 'german') say(g, 'Enemy machine guns cut down ' + fmt(total) + ' of your men in the open.', 'enemy', 'Machine guns fire automatically at anyone standing in the open within 2 squares. Soldiers who stayed out of the red zone, or were in a trench, were not hit.');
      else say(g, 'Your machine guns cut down ' + fmt(total) + ' enemy soldiers in the open.', '', 'Machine guns made it nearly impossible to cross open ground. A few guns could stop a whole attack.');
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
      WF.emit(g, { t: 'shell', r, c, big: long && center, from: { r: art.r, c: art.c } });
      const u = U.at(g, r, c);
      if (u) { casual += hurt(g, u, raw, false, 'shelling'); hits++; }
      if (long || center) cell.wire = false;
      if (long || rnd() < B.short.craterChance) { if (!cell.crater) note(g, 'crater'); cell.crater = true; }
      g.bombarded = g.bombarded || [];
      g.bombarded.push(key(r, c));
    }
    art.acted = true;
    stat(g).shells++;
    if (long && art.side === 'allied') { g.warn = { r: tr, c: tc }; note(g, 'longBombard'); }
    const w = M.label(tr, tc);
    if (art.side === 'allied') say(g, (long ? 'Long bombardment of ' : 'Bombardment of ') + w + ': ' + fmt(casual) + ' casualties' + (long ? '. The enemy is warned.' : '.'), '',
      long ? 'A long bombardment destroys more, but it tells the enemy exactly where the attack will come, so they bring up reserves. This is what happened before the Somme in 1916. The craters also slow your own advance.'
        : 'Shells destroy wire and hurt soldiers in the open, but soldiers in deep trenches survive, and the craters you make slow your own troops later.');
    else say(g, 'Enemy guns shell ' + w + '. You lost ' + fmt(casual) + '.', 'enemy', 'Artillery caused most casualties in the war. Soldiers in the open or in shallow trenches were hit hardest.');
    return casual;
  }

  function gas(g, unit, tr, tc) {
    const first = !g.techUsed.gas;
    const dmg = first ? C.gas.firstUse : (g.counters.gasMasks ? C.gas.masked : C.gas.later);
    let casual = 0;
    WF.emit(g, { t: 'gas', r: tr, c: tc, rows: C.gas.areaRows });
    for (let dr = -C.gas.areaRows; dr <= C.gas.areaRows; dr++) {
      const r = tr + dr;
      if (!M.inBounds(r, tc)) continue;
      const u = U.at(g, r, tc);
      if (u) casual += hurt(g, u, dmg, true, 'gas');
    }
    if (first) g.techUsed.gas = { y: g.year, t: g.turn };
    g.units = g.units.filter(u => u !== unit);       // one-time attack: the company is spent
    say(g, 'Gas attack on ' + M.label(tr, tc) + (first ? ' catches the enemy unprepared. ' : '. ') + fmt(casual) + ' enemy casualties' + (!first && g.counters.gasMasks ? ' (gas masks limit the effect)' : '') + '.', '',
      first ? 'Gas was a new weapon and soldiers had no protection, so the first attack was devastating. Within months both sides had gas masks.' : g.counters.gasMasks ? 'Gas masks made gas far less deadly than it was in 1915.' : 'Surprise was gone, so gas did less than the first time.');
    note(g, first ? 'gas' : 'gasMask');
    return casual;
  }

  const DIGGERS = ['infantry', 'machinegun', 'storm'];
  const canDig = (g, u) => DIGGERS.includes(u.type) && cellOf(g, u).trench < 3;

  function dig(g, u) {
    const cell = cellOf(g, u);
    if (!canDig(g, u)) return false;
    cell.trench++;
    WF.emit(g, { t: 'dig', r: u.r, c: u.c });
    if (!cell.dugBy) cell.dugBy = u.side;
    stat(g).digs[u.side]++;
    u.acted = true;
    if (u.side === 'allied') {
      if (u.c >= 3 && u.c <= 8) g.digCredits[u.r] = Math.min(3, (g.digCredits[u.r] || 0) + 1);
      note(g, 'firstDig');
    }
    return true;
  }

  function hold(g, u) {
    u.acted = true;
    if (cellOf(g, u).trench > 0 && u.strength < u.max) { u.strength++; WF.emit(g, { t: 'heal', id: u.id, r: u.r, c: u.c }); return true; }
    return false;
  }

  function tankBreakdowns(g) {
    const p = g.counters.antiTank ? C.tank.breakdownCountered : C.tank.breakdown;
    for (const t of g.units.filter(u => u.type === 'tank' && u.side === 'allied')) {
      t.broken = rnd() < p;
      if (t.broken) { t.acted = true; say(g, 'Tank at ' + label(t) + ' has broken down.', '', 'Early tanks were slow, hot and mechanically unreliable. Many broke down before they reached the enemy.'); note(g, 'tankBreak'); }
    }
  }

  const inRange = (u, r, c, range) => M.distance(u.r, u.c, r, c) <= range;
  const attackTargets = (g, u) => M.neighbors(u.r, u.c).map(([r, c]) => U.at(g, r, c))
    .filter(t => t && t.side !== u.side);

  return { lose, hurt, estimate, attack, mgFire, bombard, gas, dig, hold, canDig, tankBreakdowns,
           inRange, attackTargets, say, key, stat };
})();
