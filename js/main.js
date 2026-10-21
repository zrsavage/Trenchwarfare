// Game state, turn order, and input handling.
globalThis.WF = globalThis.WF || {};

WF.Game = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units;
  let game = null;
  let selectedId = null;
  let mode = 'move';
  let inspect = null;

  function newGame() {
    const g = {
      year: C.startYear, turn: 1, nextId: 1,
      map: M.create(), units: [],
      casualties: 0, morale: C.startMorale, manpower: C.manpowerByYear[C.startYear] || 0,
      showZones: false, log: [], over: false,
    };
    U.placeStartingForces(g);
    return g;
  }

  function say(text, kind) { game.log.push({ text, kind }); }

  // ---- Persistence (optional; never allowed to break the game) ----
  function save() {
    try { localStorage.setItem(C.saveKey, JSON.stringify(game)); } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(C.saveKey);
      if (!raw) return null;
      const g = JSON.parse(raw);
      if (!g || !g.map || g.map.length !== C.rows || !Array.isArray(g.units)) return null;
      return g;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(C.saveKey); } catch (e) { /* ignore */ } }

  // ---- View ----
  function currentView() {
    const sel = selectedId ? U.byId(game, selectedId) : null;
    let reach = null;
    if (sel && sel.side === 'allied' && !sel.acted && mode === 'move' && !game.over) reach = U.reachable(game, sel);
    const kill = (sel || game.showZones) ? U.killZone(game, 'allied') : null;
    return { selected: sel, mode, reach, kill: (game.showZones || sel) ? kill : null, inspect };
  }
  function refresh() { WF.UI.render(game, currentView()); save(); }

  // ---- Input ----
  function onCell(r, c) {
    if (game.over) return;
    const clicked = U.at(game, r, c);
    const sel = selectedId ? U.byId(game, selectedId) : null;

    if (sel && sel.side === 'allied' && !sel.acted && mode === 'move' && !clicked) {
      const reach = U.reachable(game, sel).get(r + ',' + c);
      if (reach) {
        const from = M.label(sel.r, sel.c);
        U.moveTo(game, sel, r, c);
        say(C.units[sel.type].name + ' moved ' + from + ' → ' + M.label(r, c) + '.');
        selectedId = null; inspect = null; mode = 'move';
        return refresh();
      }
    }
    if (clicked) { selectedId = clicked.id; inspect = null; mode = 'move'; }
    else { selectedId = null; inspect = { r, c }; }
    refresh();
  }

  function onAction(a) {
    if (game.over) return;
    if (a === 'endturn') return endTurn();
    const sel = selectedId ? U.byId(game, selectedId) : null;
    if (!sel || sel.side !== 'allied' || sel.acted) return;
    if (a === 'move') mode = 'move';
    if (a === 'hold') {
      sel.acted = true;
      say(C.units[sel.type].name + ' at ' + M.label(sel.r, sel.c) + ' holds.');
      selectedId = null;
    }
    refresh();
  }

  function endTurn() {
    // Phase 3 adds the computer's turn here. For now the Germans simply hold.
    say('The German army holds its positions.', 'enemy');
    for (const u of game.units) u.acted = false;
    selectedId = null; inspect = null; mode = 'move';
    game.turn++;
    if (game.turn > C.turnsPerYear) {
      game.turn = 1;
      if (game.year >= C.endYear) {
        game.turn = C.turnsPerYear;
        game.over = true;
        say('November 11, 1918. The Armistice.', 'note');
        refresh();
        return WF.UI.showOverlay('Armistice, November 11, 1918',
          '<p>The guns fall silent. Endings, casualty comparisons and reflection questions arrive in a later phase.</p>',
          'New game', restart);
      }
      game.year++;
      game.manpower = C.manpowerByYear[game.year] || 0;
      say('— ' + game.year + ' —', 'note');
    }
    refresh();
  }

  function restart() { clearSave(); game = newGame(); selectedId = null; inspect = null; intro(); refresh(); }

  function intro() {
    say('August 1914. The war begins. Armies meet in open country.', 'note');
    say('Select a blue unit, then click a marked square to move it.');
    WF.UI.showOverlay('Western Front, 1914',
      '<p>You command the Allied armies (blue circles). The German army (gray squares) faces you across open ground.</p>' +
      '<p><b>This is phase 1:</b> map, units, selection and movement. Combat, digging and the computer\'s turn arrive in later phases.</p>' +
      '<p>Click a unit, then a marked square to move. Red squares are under machine-gun fire.</p>',
      'Begin');
  }

  function start() {
    WF.UI.init({
      onCell, onAction,
      onToggleZones: v => { game.showZones = v; refresh(); },
      onNewGame: () => { if (window.confirm('Start a new game? Current progress will be lost.')) restart(); },
    });
    const saved = load();
    if (saved) { game = saved; refresh(); }
    else { game = newGame(); intro(); refresh(); }
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', start);
  return { newGame };
})();
