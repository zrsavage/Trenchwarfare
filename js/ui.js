// Rendering and DOM event wiring. No game rules live here.
globalThis.WF = globalThis.WF || {};

WF.UI = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units;
  const $ = id => document.getElementById(id);
  const cellEls = [];
  let handlers = {};

  const SIDE_NAME = { allied: 'Allied', german: 'German' };

  function build() {
    const grid = $('grid');
    grid.style.gridTemplateColumns = 'repeat(' + C.cols + ', var(--cell))';
    grid.innerHTML = '';
    for (let r = 0; r < C.rows; r++) {
      cellEls[r] = [];
      for (let c = 0; c < C.cols; c++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cell';
        b.dataset.r = r; b.dataset.c = c;
        b.tabIndex = (r === 0 && c === 0) ? 0 : -1;
        grid.appendChild(b);
        cellEls[r][c] = b;
      }
    }
    grid.addEventListener('click', e => {
      const b = e.target.closest('.cell');
      if (b) handlers.onCell(+b.dataset.r, +b.dataset.c);
    });
    // Arrow keys move between sectors (roving tabindex); Enter/Space click natively.
    grid.addEventListener('keydown', e => {
      const b = e.target.closest('.cell');
      if (!b) return;
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (!d) return;
      const r = +b.dataset.r + d[0], c = +b.dataset.c + d[1];
      if (!M.inBounds(r, c)) return;
      e.preventDefault();
      b.tabIndex = -1; cellEls[r][c].tabIndex = 0; cellEls[r][c].focus();
    });
    $('actions').addEventListener('click', e => {
      const b = e.target.closest('button[data-action]');
      if (b && !b.disabled) handlers.onAction(b.dataset.action);
    });
    $('show-zones').addEventListener('change', e => handlers.onToggleZones(e.target.checked));
    $('newgame').addEventListener('click', () => handlers.onNewGame());
  }

  function init(h) { handlers = h; build(); }

  function unitHtml(u) {
    const def = C.units[u.type];
    return '<span class="unit ' + u.side + (u.acted ? ' acted' : '') + (u.broken ? ' broken' : '') + '" title="' +
      SIDE_NAME[u.side] + ' ' + def.name + '">' +
      '<svg class="ico" aria-hidden="true"><use href="#i-' + u.type + '"/></svg>' +
      '<span class="str">' + u.strength + '</span></span>';
  }

  function cellLabel(game, r, c) {
    const cell = game.map[r][c], u = U.at(game, r, c);
    let s = 'Sector ' + M.label(r, c) + ', ' + M.describe(cell);
    if (u) s += ', ' + SIDE_NAME[u.side] + ' ' + C.units[u.type].name + ' strength ' + u.strength;
    return s;
  }

  function renderCells(game, view) {
    const sel = view.selected;
    for (let r = 0; r < C.rows; r++) {
      for (let c = 0; c < C.cols; c++) {
        const cell = game.map[r][c], u = U.at(game, r, c), k = r + ',' + c;
        const cls = ['cell', M.zone(c)];
        if (cell.wire) cls.push('has-wire');
        if (cell.crater) cls.push('has-crater');
        if (cell.rail) cls.push('has-rail');
        if (view.kill && view.kill.has(k)) cls.push('kill');
        if (sel && sel.r === r && sel.c === c) cls.push('selected');
        const reach = view.reach && view.reach.get(k);
        if (reach) cls.push('reach');
        const tg = view.targets && view.targets.get(k);
        if (tg) cls.push('target-' + tg);
        if (view.place && view.place.has(k)) cls.push('reach');
        if (view.inspect && view.inspect.r === r && view.inspect.c === c) cls.push('inspect');

        let h = '';
        if (cell.trench) {
          h += '<span class="trench">' + '<i></i>'.repeat(cell.trench) + '</span>';
        }
        if (cell.hub) h += '<svg class="hub" aria-hidden="true"><use href="#i-hub"/></svg>';
        if (u) h += unitHtml(u);
        else if (reach) h += '<span class="cost">' + reach.cost + '</span>';
        h += '<span class="coord">' + M.label(r, c) + '</span>';

        const el = cellEls[r][c];
        el.className = cls.join(' ');
        el.innerHTML = h;
        el.setAttribute('aria-label', cellLabel(game, r, c));
      }
    }
  }

  function renderInfo(game, view) {
    const box = $('info');
    const u = view.selected;
    const coach = view.coach ? '<p class="coach">' + view.coach + '</p>' : '';
    if (u) {
      const def = C.units[u.type], cell = game.map[u.r][u.c];
      const status = u.side !== 'allied' ? 'Enemy unit'
        : u.acted ? 'Already acted this turn' : 'Ready';
      box.innerHTML =
        '<h2>' + SIDE_NAME[u.side] + ' ' + def.name + '</h2>' +
        '<dl><dt>Strength</dt><dd>' + u.strength + ' / ' + C.maxStrength + ' (' + U.men(u).toLocaleString() + ' men)</dd>' +
        '<dt>Move</dt><dd>' + def.move + '</dd>' +
        '<dt>Sector</dt><dd>' + M.label(u.r, u.c) + ' &mdash; ' + M.describe(cell) + '</dd>' +
        '<dt>Status</dt><dd>' + (u.broken ? 'Broken down' : status) + '</dd></dl>' +
        '<p>' + def.role + '</p>' + coach;
    } else if (view.inspect) {
      const { r, c } = view.inspect;
      box.innerHTML = '<h2>Sector ' + M.label(r, c) + '</h2><p>' + cap(M.describe(game.map[r][c])) + '.</p>' + coach;
    } else {
      box.innerHTML = '<h2>Your move</h2><p>Click one of your blue units to select it, then click a marked square to move there. ' +
        'Each unit gets one action per turn. Press <b>End Turn</b> when you are done.</p>' + coach;
    }
  }

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function renderLog(game) {
    const ol = $('log');
    ol.innerHTML = '';
    for (const m of game.log.slice(-40)) {
      const li = document.createElement('li');
      li.textContent = m.text;
      if (m.kind) li.className = m.kind;
      ol.appendChild(li);
    }
    ol.scrollTop = ol.scrollHeight;
  }

  function render(game, view) {
    $('year').textContent = game.year;
    $('turn').textContent = game.turn + '/' + C.turnsPerYear;
    $('casualties').textContent = (game.casualties * C.menPerStrength).toLocaleString();
    $('morale').textContent = Math.round(game.morale);
    $('morale-fill').style.width = Math.max(0, game.morale) + '%';
    $('morale-bar').setAttribute('aria-valuenow', Math.round(game.morale));
    $('manpower').textContent = game.manpower;
    $('show-zones').checked = !!game.showZones;

    renderCells(game, view);
    renderInfo(game, view);
    renderLog(game);

    for (const b of document.querySelectorAll('#actions .act')) {
      const a = b.dataset.action;
      if (a === 'endturn') { b.disabled = game.over; continue; }
      b.disabled = !view.actions[a];
      b.classList.toggle('active', view.mode === a && !b.disabled);
    }
    renderRecruit(game, view);
  }

  function renderRecruit(game, view) {
    const box = $('recruit');
    box.innerHTML = '<h2>Recruit <span class="pool">(' + game.manpower + ' manpower)</span></h2>';
    const row = document.createElement('div');
    row.className = 'recruits';
    for (const o of view.recruit) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'act small';
      b.textContent = o.name + ' (' + o.cost + ')';
      b.disabled = !o.ok;
      b.classList.toggle('active', view.recruitType === o.type);
      b.onclick = () => handlers.onRecruit(o.type);
      row.appendChild(b);
    }
    box.appendChild(row);
    if (view.mode === 'place') {
      const p = document.createElement('p'); p.className = 'hint';
      p.textContent = 'Click an empty square in the Allied rear to place the unit.';
      box.appendChild(p);
    }
  }

  function showOverlay(title, html, buttonText, onClick, cancelText) {
    $('ov-title').textContent = title;
    $('ov-body').innerHTML = html;
    const btn = $('ov-btn');
    btn.textContent = buttonText;
    btn.onclick = () => { $('overlay').hidden = true; onClick && onClick(); };
    const cancel = $('ov-cancel');
    cancel.hidden = !cancelText;
    cancel.textContent = cancelText || '';
    cancel.onclick = () => { $('overlay').hidden = true; };
    $('overlay').hidden = false;
    btn.focus({ preventScroll: true });
    const card = document.querySelector('#overlay .card'); if (card) card.scrollTop = 0;
  }

  function showEnd(sum, onAgain) {
    const rows = sum.stats.map(r => '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>').join('');
    const html = '<p>' + sum.lead + '</p><table class="stats">' + rows + '</table>' +
      '<h3>Compare</h3><ul>' + sum.comparisons.map(c => '<li>' + c + '</li>').join('') + '</ul>' +
      '<h3>Think about it</h3><ol>' + sum.questions.map(q => '<li>' + q + '</li>').join('') + '</ol>';
    showOverlay(sum.title, html, 'Play Again', onAgain);
  }

  return { init, render, showOverlay, showEnd };
})();
