// Game state, turn order, and input handling.
globalThis.WF = globalThis.WF || {};

WF.Game = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, K = WF.Combat, Y = WF.Years;
  let game = null, selectedId = null, mode = 'move', recruitType = null, locked = false, zoomIdx = 0;
  const ZOOMS = [[1, 'Zoom: Fit'], [1.4, 'Zoom: Large'], [1.9, 'Zoom: Huge']];

  function newGame(player) {
    const g = {
      version: 4, player: player || 'allied', moments: [], year: C.startYear, turn: 1, turnCount: 1, nextId: 1,
      map: M.create(), owner: [], units: [], events: [],
      casualties: 0, gCasualties: 0, morale: C.startMorale, manpower: C.manpowerByYear[C.startYear] || 0,
      showZones: true, log: [], over: false, tutorialDone: false,
      digCredits: {}, bombarded: [], techUsed: {}, counters: {}, notes: {}, tut: {},
      exhaustion: 0, farthest: 0, warn: null, hubHeld: false, tips: {},
    };
    K.stat(g);
    for (let r = 0; r < C.rows; r++) {
      g.owner.push([]);
      for (let c = 0; c < C.cols; c++) g.owner[r].push(c <= C.alliedFront ? 'a' : c >= 8 ? 'g' : null);
    }
    U.placeStartingForces(g);
    return g;
  }

  const say = (text, kind) => game.log.push({ text, kind });

  // ---- Persistence (optional; never allowed to break the game) ----
  function save() {
    if (game.over) return;
    try { localStorage.setItem(C.saveKey, JSON.stringify(game, (k, v) => (k === 'events' ? undefined : v))); } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(C.saveKey);
      if (!raw) return null;
      const g = JSON.parse(raw);
      if (!g || g.version !== 4 || g.over || !g.map || g.map.length !== C.rows || !Array.isArray(g.units)) return null;
      g.events = []; g.tips = g.tips || {};
      return g;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(C.saveKey); } catch (e) { /* ignore */ } }

  // ---- What the selected unit may do ----
  const selected = () => (selectedId ? U.byId(game, selectedId) : null);
  const canAct = u => !!u && u.side === 'allied' && !u.acted && !u.broken && !game.over;
  const defaultMode = u => (u.type === 'artillery' ? 'bombard' : u.type === 'gas' && game.year >= C.gas.unlockYear ? 'gas' : 'move');

  function actionState(u) {
    const a = { move: false, dig: false, bombard: false, long: false, gas: false, hold: false };
    if (!canAct(u)) return a;
    a.move = true; a.hold = true;
    a.dig = K.canDig(game, u);
    a.bombard = u.type === 'artillery';
    a.long = u.type === 'artillery' && game.year >= C.bombard.long.unlockYear;
    a.gas = u.type === 'gas' && game.year >= C.gas.unlockYear;
    return a;
  }

  function rangeSquares(u) {
    const t = new Map();
    if (!canAct(u) || !(mode === 'bombard' || mode === 'long' || mode === 'gas')) return t;
    const range = mode === 'gas' ? C.ranges.gas : C.ranges.artillery;
    for (let r = 0; r < C.rows; r++) for (let c = 0; c < C.cols; c++)
      if (M.distance(u.r, u.c, r, c) <= range && !(r === u.r && c === u.c)) t.set(r + ',' + c, true);
    return t;
  }

  function splash(r, c) {
    if (mode === 'long') return [[r, c]].concat(M.neighbors(r, c));
    if (mode === 'gas') { const o = []; for (let d = -C.gas.areaRows; d <= C.gas.areaRows; d++) if (M.inBounds(r + d, c)) o.push([r + d, c]); return o; }
    return [[r, c]];
  }

  function placeSquares() {
    const s = new Set();
    if (mode !== 'place') return s;
    for (let r = 0; r < C.rows; r++) for (const c of C.alliedRearCols) if (!U.at(game, r, c)) s.add(r + ',' + c);
    return s;
  }

  function recruitOptions() {
    return Object.keys(C.units).filter(t => U.isAvailable(t, game.year))
      .map(t => ({ type: t, name: C.units[t].name, cost: C.recruitCost[t], ok: C.recruitCost[t] <= game.manpower && !game.over }));
  }

  function buildView() {
    const sel = selected();
    const kill = U.killZone(game, 'allied');
    const danger = new Set();
    for (const u of game.units) if (u.side === 'allied' && kill.has(u.r + ',' + u.c)) danger.add(u.id);
    const reach = canAct(sel) && mode === 'move' ? U.reachable(game, sel) : null;
    const targets = new Map();
    if (canAct(sel) && mode === 'move' && C.combat.atkMod[sel.type] > 0) for (const e of K.attackTargets(game, sel)) targets.set(e.r + ',' + e.c, e.id);
    const v = {
      game, selected: sel, mode, reach, targets, range: rangeSquares(sel), place: placeSquares(), splash,
      kill: game.showZones || sel ? kill : null, danger, actions: actionState(sel),
      recruit: recruitOptions(), recruitType, locked,
    };
    v.advice = WF.Coach.advise(game, v);
    v.pulses = locked || !v.advice ? [] : v.advice.pulses || [];
    return v;
  }

  // A one-time tip counts as learned once the player acts while it is showing.
  let shownTip = null;
  function markSeen() { if (shownTip) game.tips[shownTip] = true; }

  function refresh() {
    const v = buildView();
    shownTip = v.advice && v.advice.key ? v.advice.key : null;
    WF.Render.setView(v);
    WF.UI.render(game, v, v.advice);
    save();
  }

  function flush() { const ev = game.events; game.events = []; WF.Render.enqueue(ev); }

  // ---- Input ----
  function afterAction() {
    markSeen();
    selectedId = null; mode = 'move';
    flush();
    if (game.morale <= 0) return finish('collapse');
    refresh();
  }

  function select(u) {
    selectedId = u.id; recruitType = null; mode = defaultMode(u);
    WF.Audio.play('click');
    if (zoomIdx) WF.Render.scrollTo(u.r, u.c);
  }

  function onCell(r, c) {
    if (locked || game.over) return;
    WF.UI.hideTip();
    const clicked = U.at(game, r, c), sel = selected(), k = r + ',' + c;

    if (mode === 'place' && !clicked && placeSquares().has(k)) {
      const cost = C.recruitCost[recruitType];
      if (game.manpower >= cost) {
        game.manpower -= cost;
        const u = U.create(game, recruitType, 'allied', r, c);
        WF.emit(game, { t: 'spawn', id: u.id });
        say(C.units[recruitType].name + ' arrives at ' + M.label(r, c) + '.');
        markSeen(); recruitType = null; mode = defaultMode(u); selectedId = u.id;
        flush(); return refresh();
      }
    }

    if (canAct(sel)) {
      if (mode === 'move') {
        if (clicked && clicked.side === 'german' && C.combat.atkMod[sel.type] > 0 && K.attackTargets(game, sel).includes(clicked)) {
          if (sel.type === 'tank' && !game.techUsed.tank) game.techUsed.tank = { y: game.year, t: game.turn };
          K.attack(game, sel, clicked); game.tut.attacked = true;
          return afterAction();
        }
        if (!clicked && U.reachable(game, sel).has(k)) {
          const from = M.label(sel.r, sel.c);
          U.moveTo(game, sel, r, c); game.tut.moved = true;
          if (sel.type === 'tank' && !game.techUsed.tank) game.techUsed.tank = { y: game.year, t: game.turn };
          say(C.units[sel.type].name + ' moved ' + from + ' → ' + M.label(r, c) + '.');
          if (game.map[r][c].hub) Y.note(game, 'hub');
          WF.Audio.play('click');
          return afterAction();
        }
      } else if ((mode === 'bombard' || mode === 'long') && rangeSquares(sel).has(k)) {
        K.bombard(game, sel, r, c, mode); return afterAction();
      } else if (mode === 'gas' && rangeSquares(sel).has(k)) {
        K.gas(game, sel, r, c); return afterAction();
      }
    }

    if (clicked) select(clicked);
    else { selectedId = null; if (mode !== 'place') mode = 'move'; }
    refresh();
  }

  function onAction(a) {
    if (locked || game.over) return;
    const sel = selected();
    if (!actionState(sel)[a]) return;
    recruitType = null;
    if (a === 'move' || a === 'bombard' || a === 'long' || a === 'gas') { mode = a; WF.Audio.play('click'); return refresh(); }
    if (a === 'dig') {
      K.dig(game, sel); game.tut.dug = true;
      say(C.units[sel.type].name + ' digs in at ' + M.label(sel.r, sel.c) + '. Trench level ' + game.map[sel.r][sel.c].trench + '.');
      return afterAction();
    }
    if (a === 'hold') {
      const healed = K.hold(game, sel);
      say(C.units[sel.type].name + ' at ' + M.label(sel.r, sel.c) + (healed ? ' rests and recovers 1,000 men.' : ' waits.'));
      return afterAction();
    }
  }

  function onRecruit(type) {
    if (locked || game.over) return;
    const opt = recruitOptions().find(o => o.type === type);
    if (!opt || !opt.ok) return;
    if (mode === 'place' && recruitType === type) { mode = 'move'; recruitType = null; }
    else { mode = 'place'; recruitType = type; selectedId = null; }
    WF.Audio.play('click');
    refresh();
  }

  // ---- Hover tooltips ----
  const label = u => WF.Names.adj(game, u.side) + ' ' + C.units[u.type].name;
  const men = n => Math.round(n * C.menPerStrength).toLocaleString();

  function odds(toDef, toAtt) {
    const ratio = toDef / Math.max(0.1, toAtt);
    if (toDef < 0.8) return ['bad', 'Suicidal: you barely scratch them'];
    if (ratio >= 1.4) return ['good', 'Good odds'];
    if (ratio >= 0.9) return ['even', 'Even fight'];
    if (ratio >= 0.5) return ['bad', 'Bad odds'];
    return ['bad', 'Terrible odds'];
  }

  function describeHover(r, c) {
    const sel = selected(), u = U.at(game, r, c), k = r + ',' + c, cell = game.map[r][c];
    const v = { reach: canAct(sel) && mode === 'move' ? U.reachable(game, sel) : null };
    if (mode === 'place' && placeSquares().has(k)) return '<b>Place your new unit here</b>';
    if (canAct(sel) && mode === 'move' && u && u.side === 'german' && K.attackTargets(game, sel).includes(u) && C.combat.atkMod[sel.type] > 0) {
      const e = K.estimate(game, sel, u), o = odds(e.toDef, e.toAtt);
      return '<b>Attack ' + label(u) + '</b><div class="odds ' + o[0] + '">' + o[1] + '</div>' +
        '<div>You deal about <b>' + men(e.toDef) + '</b></div><div>You lose about <b>' + men(e.toAtt) + '</b></div>' +
        (e.creeping ? '<div class="good">Creeping barrage: no machine-gun help for them</div>' : '') +
        (u.type !== 'infantry' ? '' : g_cover(u));
    }
    if (canAct(sel) && (mode === 'bombard' || mode === 'long') && rangeSquares(sel).has(k)) {
      const long = mode === 'long', dmg = long ? C.bombard.long.damage : C.bombard.short.damage;
      const hit = splash(r, c).map(([rr, cc]) => U.at(game, rr, cc)).filter(Boolean);
      const friendly = hit.some(x => x.side === 'allied');
      return '<b>' + (long ? 'Long barrage' : 'Shell') + ' ' + M.label(r, c) + '</b><div>Up to about <b>' + men(dmg * (1 - [0, .4, .6, .8][cell.trench])) + '</b> damage to the target' +
        (cell.trench ? ' (trench level ' + cell.trench + ' absorbs some)' : '') + '</div><div>Leaves craters and clears wire.</div>' +
        (long ? '<div class="bad">The enemy will see it coming</div>' : '') + (friendly ? '<div class="bad">Warning: you would hit your own men</div>' : '');
    }
    if (canAct(sel) && mode === 'gas' && rangeSquares(sel).has(k)) return '<b>Gas attack on ' + M.label(r, c) + '</b><div>Hits 3 squares in a line. Trenches don\'t help against gas.</div>' + (game.techUsed.gas ? '' : '<div class="good">First use: very effective</div>');
    if (v.reach && v.reach.has(k)) {
      const inKill = U.killZone(game, 'allied').has(k);
      return '<b>Move to ' + M.label(r, c) + '</b>' + (cell.crater ? '<div>Craters slow you down</div>' : '') + (cell.trench ? '<div class="good">Trench: you\'ll be protected here</div>' : '') +
        (inKill ? '<div class="bad">Machine-gun fire here. You will be shot.</div>' : '');
    }
    if (u) {
      const def = C.units[u.type];
      return '<b>' + label(u) + '</b><div>' + men(u.strength) + ' men' + (u.side === 'allied' && u.strength < u.max ? ' <span class="good">(wounded: rest in a trench to heal)</span>' : '') + '</div><div class="dim">' + def.role + '</div>';
    }
    const parts = [M.describe(cell)];
    return '<b>Sector ' + M.label(r, c) + '</b><div>' + parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + '</div>' +
      (U.killZone(game, 'allied').has(r + ',' + c) ? '<div class="bad">Enemy machine-gun fire covers this square</div>' : '');
  }
  const g_cover = u => (game.map[u.r][u.c].trench ? '<div class="dim">They are dug in (level ' + game.map[u.r][u.c].trench + ')</div>' : '');

  function onHover(cell, x, y, kb) {
    if (!cell || locked) return WF.UI.hideTip();
    const html = describeHover(cell.r, cell.c);
    if (kb) { const p = WF.Render.screenPos(cell.r, cell.c); x = p.x + p.size / 2; y = p.y + p.size / 2; }
    WF.UI.showTip(html, x, y);
  }

  // ---- Turn order ----
  const alliedOnHub = () => game.units.some(u => u.side === 'allied' && game.map[u.r][u.c].hub);

  function endTurn() {
    if (locked || game.over) return;
    markSeen();
    selectedId = null; mode = 'move'; recruitType = null; game.tut.ended = true;
    WF.UI.hideTip();
    game.hubHeld = alliedOnHub();
    { const kz = U.killZone(game, 'allied'); K.stat(game).exposedTurns += game.units.filter(u => u.side === 'allied' && kz.has(u.r + ',' + u.c)).length; }
    K.mgFire(game, 'allied');
    WF.UI.banner(WF.Names.foe(game) + ' turn', 'Watch what they do');
    WF.AI.takeTurn(game);
    K.mgFire(game, 'german');

    { // worst turn of the game
      const st = K.stat(game), tc = st.turnCauses, total = Object.values(tc).reduce((a, b) => a + b, 0);
      if (total * C.menPerStrength > (st.worst.men || 0)) {
        const top = Object.keys(tc).sort((a, b) => tc[b] - tc[a])[0];
        st.worst = { men: total * C.menPerStrength, label: game.year + ', turn ' + game.turn, cause: ({ machinegun: 'machine guns', shelling: 'artillery shells', assault: 'infantry assaults', gas: 'gas' })[top] || 'combat' };
      }
      st.turnCauses = {};
    }
    let outcome = null, yearCard = null;
    if (game.morale <= 0) outcome = 'collapse';
    else if (game.hubHeld && alliedOnHub()) outcome = 'breakthrough';
    if (!outcome) {
      game.turn++; game.turnCount++;
      if (game.turn > C.turnsPerYear) {
        if (game.year >= C.endYear) { game.turn = C.turnsPerYear; outcome = 'armistice'; }
        else {
          game.turn = 1; game.year++; Y.startYear(game); yearCard = game.year;
          if (game.morale <= 0) outcome = 'collapse';
        }
      }
      if (!outcome) {
        for (const u of game.units) u.acted = false;
        game.bombarded = []; game.hubHeld = false;
        K.tankBreakdowns(game);
      }
    }
    if (game.year > C.startYear || game.turnCount > 4 || (game.tut.moved && game.tut.dug)) game.tutorialDone = true;

    locked = true;
    flush();
    refresh();
    WF.Render.whenIdle(() => {
      locked = false;
      if (outcome) return finish(outcome);
      if (yearCard) showYearCard(yearCard);
      else WF.UI.banner('Your turn', C.units.infantry ? 'Turn ' + game.turn + ' of ' + C.turnsPerYear + ', ' + game.year : '');
      refresh();
    });
  }

  function showYearCard(year, first) {
    const c = Y.card(year, game);
    if (!c) return;
    WF.Audio.play('horn');
    WF.UI.card({ kicker: String(year), title: c.title, className: 'yearcard',
      html: '<p class="hist">' + c.text + '</p><div class="news"><b>What\'s new</b><span>' + c.news + '</span></div>', button: 'Continue' });
  }

  function intro() {
    WF.UI.card({ kicker: 'August 1914', title: 'Break the stalemate', className: 'briefing',
      html: '<p class="hist">War has come to Europe. You command the ' + (game.player === 'german' ? 'German army' : 'Allied armies') + ' (blue) facing the ' + (game.player === 'german' ? 'Allied armies' : 'German army') + ' (gray) on the Western Front.</p>' +
        '<ul class="mission"><li><b>Your goal</b>Capture a gold-star <span class="star">★</span> rail ' + (game.player === 'german' ? 'junction' : 'hub') + ' deep behind the enemy lines, and hold it for a turn.</li>' +
        '<li><b>Your time</b>The war ends in November 1918. That is 30 turns.</li>' +
        '<li><b>Your help</b>Your sergeant explains everything as you go. Just follow the yellow arrows.</li></ul>',
      button: 'Start the war', onClick: () => refresh() });
  }

  function finish(type) {
    game.over = true; locked = false;
    clearSave();
    selectedId = null; mode = 'move';
    refresh();
    WF.UI.endScreen(Y.endSummary(game, type), restart, game);
  }

  function restart() {
    clearSave();
    game = newGame('allied'); selectedId = null; mode = 'move'; recruitType = null; locked = false;
    refresh();
    WF.UI.card({ kicker: 'Western Front', title: 'Choose your army', className: 'briefing',
      html: '<p class="hist">The same war, seen from either side of no man\'s land. The rules are the same for both, so you will meet the same problems.</p>',
      choices: [
        { label: 'Play as the Allies', sub: 'Britain, France and their allies. Break through the German line.', onClick: () => begin('allied') },
        { label: 'Play as Germany', sub: 'The German army. Break through the Allied line.', onClick: () => begin('german') },
      ] });
  }

  function begin(player) {
    game = newGame(player); selectedId = null; mode = 'move'; recruitType = null; locked = false;
    say('August 1914. The war begins. Armies meet in open country.', 'note');
    refresh();
    intro();
  }

  function help() {
    WF.UI.card({ kicker: 'How to play', title: 'Quick guide', className: 'help',
      html: '<ol class="steps"><li><b>Select</b> a blue unit by clicking it.</li>' +
        '<li><b>Move</b> by clicking a glowing square. <b>Attack</b> by clicking a red target next to you. Hover to see the odds first.</li>' +
        '<li><b>Dig in</b>, rest or shell using the buttons that appear. Each unit gets one action per turn.</li>' +
        '<li>Press <b>End Turn</b> (or the E key). The enemy moves, then it is your turn again.</li></ol>' +
        '<div class="legend"><span><i class="lg hatch"></i>Machine-gun fire zone: units in the open here get shot</span>' +
        '<span><i class="lg star"></i>Rail hub: capture and hold one to win</span>' +
        '<span><i class="lg dash"></i>Dashed line: the front line between the armies</span>' +
        '<span><i class="lg bar"></i>Green bar: soldiers left in the unit</span></div>' +
        '<p class="dim">Keyboard: arrow keys move the cursor on the map, Enter clicks, Esc deselects, E ends the turn.</p>',
      button: 'Got it' });
  }

  function start() {
    try {
      const t = parseInt(new URLSearchParams(location.search).get('turns'), 10);   // teacher option: ?turns=4
      if (t >= 2 && t <= 6) C.turnsPerYear = t;
    } catch (e) { /* ignore */ }
    WF.UI.init({
      onEndTurn: endTurn, onAction, onRecruit, onHelp: help,
      onZoom: () => { zoomIdx = (zoomIdx + 1) % ZOOMS.length; WF.Render.setZoom(ZOOMS[zoomIdx][0]); document.getElementById('btn-zoom').textContent = ZOOMS[zoomIdx][1]; const s = selected(); if (s && zoomIdx) WF.Render.scrollTo(s.r, s.c); },
      onFull: () => {
        const b = document.getElementById('btn-full');
        try {
          if (document.fullscreenElement) { document.exitFullscreen(); return; }
          const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
          if (p && p.catch) p.catch(() => { b.textContent = 'Not available'; b.disabled = true; });
        } catch (e) { b.textContent = 'Not available'; b.disabled = true; }
      },
      onSound: () => { WF.Audio.setMuted(!WF.Audio.isMuted()); refresh(); },
      onNewGame: () => WF.UI.card({ title: 'Restart the war?', html: '<p>Your current game will be lost.</p>', button: 'Restart', onClick: restart, cancel: 'Keep playing' }),
    });
    WF.Render.init(document.getElementById('board'), document.getElementById('board-wrap'), {
      onCell, onHover, onCancel: () => { selectedId = null; mode = 'move'; recruitType = null; refresh(); },
    });
    const saved = load();
    if (saved) { game = saved; refresh(); }
    else restart();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  return { newGame, endTurn, onCell, onAction, _set: g => { game = g; }, _get: () => game };
})();
