// Game state, turn order, and input handling.
globalThis.WF = globalThis.WF || {};

WF.Game = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, K = WF.Combat, Y = WF.Years;
  let game = null;
  let selectedId = null;
  let mode = 'move';          // move | attack | bombard | long | gas | place
  let recruitType = null;
  let inspect = null;

  function newGame() {
    const g = {
      version: 2, year: C.startYear, turn: 1, turnCount: 1, nextId: 1,
      map: M.create(), owner: [], units: [],
      casualties: 0, gCasualties: 0, morale: C.startMorale, manpower: C.manpowerByYear[C.startYear] || 0,
      showZones: false, log: [], over: false,
      digCredits: {}, bombarded: [], techUsed: {}, counters: {}, notes: {}, tut: {},
      exhaustion: 0, farthest: 0, warn: null, hubHeld: false,
    };
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
    try { localStorage.setItem(C.saveKey, JSON.stringify(game)); } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(C.saveKey);
      if (!raw) return null;
      const g = JSON.parse(raw);
      if (!g || g.version !== 2 || g.over || !g.map || g.map.length !== C.rows || !Array.isArray(g.units)) return null;
      return g;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(C.saveKey); } catch (e) { /* ignore */ } }

  // ---- What the selected unit may do ----
  const selected = () => (selectedId ? U.byId(game, selectedId) : null);
  const canAct = u => u && u.side === 'allied' && !u.acted && !game.over;

  function actionState(u) {
    const a = { move: false, attack: false, dig: false, bombard: false, long: false, gas: false, hold: false };
    if (!canAct(u)) return a;
    a.move = true; a.hold = true;
    a.attack = C.combat.atkMod[u.type] > 0 && K.attackTargets(game, u).length > 0;
    a.dig = K.canDig(game, u);
    a.bombard = u.type === 'artillery';
    a.long = u.type === 'artillery' && game.year >= C.bombard.long.unlockYear;
    a.gas = u.type === 'gas' && game.year >= C.gas.unlockYear;
    return a;
  }

  function targetSquares(u) {
    const t = new Map();
    if (!canAct(u)) return t;
    if (mode === 'attack') for (const e of K.attackTargets(game, u)) t.set(e.r + ',' + e.c, 'attack');
    const range = mode === 'gas' ? C.ranges.gas : C.ranges.artillery;
    if (mode === 'bombard' || mode === 'long' || mode === 'gas') {
      for (let r = 0; r < C.rows; r++) for (let c = 0; c < C.cols; c++) {
        if (M.distance(u.r, u.c, r, c) <= range && !(r === u.r && c === u.c)) t.set(r + ',' + c, 'range');
      }
    }
    return t;
  }

  function placeSquares() {
    const s = new Set();
    if (mode !== 'place') return s;
    for (let r = 0; r < C.rows; r++) for (const c of C.alliedRearCols) if (!U.at(game, r, c)) s.add(r + ',' + c);
    return s;
  }

  function recruitOptions() {
    return Object.keys(C.units).filter(t => U.isAvailable(t, game.year) && !(t === 'gas' && game.year < C.gas.unlockYear))
      .map(t => ({ type: t, name: C.units[t].name, cost: C.recruitCost[t], ok: C.recruitCost[t] <= game.manpower }));
  }

  function currentView() {
    const sel = selected();
    let reach = null;
    if (canAct(sel) && mode === 'move') reach = U.reachable(game, sel);
    const kill = (sel || game.showZones) ? U.killZone(game, 'allied') : null;
    return {
      selected: sel, mode, reach, kill,
      targets: sel ? targetSquares(sel) : new Map(), place: placeSquares(),
      inspect, actions: actionState(sel), recruit: recruitOptions(), recruitType,
      coach: Y.coach(game), captured: null,
    };
  }

  function refresh() {
    WF.UI.render(game, currentView());
    save();
  }

  // ---- Input ----
  function afterAction() {
    selectedId = null; inspect = null; mode = 'move';
    if (game.morale <= 0) return finish('collapse');
    refresh();
  }

  function onCell(r, c) {
    if (game.over) return;
    const clicked = U.at(game, r, c);
    const sel = selected();
    const k = r + ',' + c;

    if (mode === 'place' && !clicked && placeSquares().has(k)) {
      const cost = C.recruitCost[recruitType];
      if (game.manpower >= cost) {
        game.manpower -= cost;
        const u = U.create(game, recruitType, 'allied', r, c);
        say(C.units[recruitType].name + ' arrives at ' + M.label(r, c) + '.');
        recruitType = null; mode = 'move'; selectedId = u.id;
        return refresh();
      }
    }

    if (canAct(sel)) {
      if (mode === 'move' && !clicked && U.reachable(game, sel).has(k)) {
        const from = M.label(sel.r, sel.c);
        U.moveTo(game, sel, r, c);
        game.tut.moved = true;
        if (sel.type === 'tank') game.techUsed.tank = true;
        say(C.units[sel.type].name + ' moved ' + from + ' → ' + M.label(r, c) + '.');
        if (game.map[r][c].hub) Y.note(game, 'hub');
        return afterAction();
      }
      if (mode === 'attack' && clicked && clicked.side === 'german' && targetSquares(sel).has(k)) {
        if (sel.type === 'tank') game.techUsed.tank = true;
        K.attack(game, sel, clicked);
        game.tut.attacked = true;
        return afterAction();
      }
      if ((mode === 'bombard' || mode === 'long') && targetSquares(sel).has(k)) {
        K.bombard(game, sel, r, c, mode);
        return afterAction();
      }
      if (mode === 'gas' && targetSquares(sel).has(k)) {
        K.gas(game, sel, r, c);
        return afterAction();
      }
    }

    if (clicked) { selectedId = clicked.id; inspect = null; mode = 'move'; recruitType = null; }
    else { selectedId = null; inspect = { r, c }; if (mode !== 'place') mode = 'move'; }
    refresh();
  }

  function onAction(a) {
    if (game.over) return;
    if (a === 'endturn') return endTurn();
    const sel = selected();
    const st = actionState(sel);
    if (!st[a]) return;
    recruitType = null;
    if (a === 'move' || a === 'attack' || a === 'bombard' || a === 'long' || a === 'gas') { mode = a; return refresh(); }
    if (a === 'dig') {
      K.dig(game, sel);
      game.tut.dug = true;
      say(C.units[sel.type].name + ' digs in at ' + M.label(sel.r, sel.c) + '. Trench level ' + game.map[sel.r][sel.c].trench + '.');
      return afterAction();
    }
    if (a === 'hold') {
      const healed = K.hold(game, sel);
      say(C.units[sel.type].name + ' at ' + M.label(sel.r, sel.c) + ' holds' + (healed ? ' and recovers 1,000 men.' : '.'));
      return afterAction();
    }
  }

  function onRecruit(type) {
    if (game.over) return;
    const opt = recruitOptions().find(o => o.type === type);
    if (!opt || !opt.ok) return;
    if (mode === 'place' && recruitType === type) { mode = 'move'; recruitType = null; }
    else { mode = 'place'; recruitType = type; selectedId = null; inspect = null; }
    refresh();
  }

  // ---- Turn order ----
  const alliedOnHub = () => game.units.some(u => u.side === 'allied' && game.map[u.r][u.c].hub);

  function endTurn() {
    selectedId = null; inspect = null; mode = 'move'; recruitType = null;
    game.hubHeld = alliedOnHub();
    K.mgFire(game, 'allied');
    WF.AI.takeTurn(game);
    K.mgFire(game, 'german');

    if (game.morale <= 0) return finish('collapse');
    if (game.hubHeld && alliedOnHub()) return finish('breakthrough');

    // Next turn
    game.turn++; game.turnCount++;
    if (game.turn > C.turnsPerYear) {
      if (game.year >= C.endYear) { game.turn = C.turnsPerYear; return finish('armistice'); }
      game.turn = 1; game.year++;
      Y.startYear(game);
      if (game.morale <= 0) return finish('collapse');
      for (const u of game.units) u.acted = false;
      game.bombarded = []; game.hubHeld = false;
      K.tankBreakdowns(game);
      refresh();
      return showYearCard(game.year);
    }
    for (const u of game.units) u.acted = false;
    game.bombarded = [];
    K.tankBreakdowns(game);
    refresh();
  }

  function showYearCard(year, first) {
    const c = Y.card(year);
    if (!c) return;
    WF.UI.showOverlay(c.title,
      '<p>' + c.text + '</p><p><b>New:</b> ' + c.news + '</p>' +
      (first ? '<p>Click a blue unit, then a dashed square to move. Red squares are under machine-gun fire. Press <b>End Turn</b> when done.</p>' : ''),
      first ? 'Begin' : 'Continue');
  }

  function finish(type) {
    game.over = true;
    clearSave();
    selectedId = null; mode = 'move';
    refresh();
    WF.UI.showEnd(Y.endSummary(game, type), restart);
  }

  function restart() {
    clearSave();
    game = newGame(); selectedId = null; inspect = null; mode = 'move'; recruitType = null;
    say('August 1914. The war begins. Armies meet in open country.', 'note');
    refresh();
    showYearCard(C.startYear, true);
  }

  function start() {
    try {
      const t = parseInt(new URLSearchParams(location.search).get('turns'), 10);   // teacher option: ?turns=4
      if (t >= 2 && t <= 6) C.turnsPerYear = t;
    } catch (e) { /* ignore */ }
    WF.UI.init({
      onCell, onAction, onRecruit,
      onToggleZones: v => { game.showZones = v; refresh(); },
      onNewGame: () => { if (window.confirm('Start a new game? Current progress will be lost.')) restart(); },
    });
    const saved = load();
    if (saved) { game = saved; refresh(); }
    else restart();
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', start);
  return { newGame, endTurn, onCell, onAction, _set: g => { game = g; }, _get: () => game };
})();
