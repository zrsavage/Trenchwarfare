// DOM panels: HUD, sergeant, unit card, action buttons, recruits, log, dialogs, tooltip.
// No game rules live here.
globalThis.WF = globalThis.WF || {};

WF.UI = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units;
  const $ = id => document.getElementById(id);
  let handlers = {}, bannerTimer = null, lastLogLen = -1;
  const SIDE = { allied: 'Allied', german: 'German' };
  const ICON = {
    dig: 'M17.5 2.5l4 4-2 2-4-4zM14.5 5.5l4 4L11 17.5 6.5 19l-1-1.5L7 13z',
    rest: 'M6 4h4v16H6zM14 4h4v16h-4z',
    move: 'M12 2l7 8h-4.5v12h-5V10H5z',
    long: 'M2.5 14.5 15 5.2l2.4 3.1L5 17.6zM21 3l1 5-2-1-2 3-1-5 2 1z',
  };
  const glyph = (key, cls) => '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="' + (WF.GLYPH[key] || ICON[key]) + '"/></svg>';
  const unitGlyph = u => glyph(u.type === 'infantry' ? (u.side === 'allied' ? 'infantryAllied' : 'infantryGerman') : u.type);
  const typeGlyph = t => glyph(t === 'infantry' ? 'infantryAllied' : t);

  function init(h) {
    handlers = h;
    $('endturn').addEventListener('click', () => handlers.onEndTurn());
    $('btn-help').addEventListener('click', () => handlers.onHelp());
    $('btn-zoom').addEventListener('click', () => handlers.onZoom());
    $('btn-sound').addEventListener('click', () => handlers.onSound());
    $('newgame').addEventListener('click', () => handlers.onNewGame());
    $('actions').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b && !b.disabled) handlers.onAction(b.dataset.a); });
    $('recruit').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b && !b.disabled) handlers.onRecruit(b.dataset.t); });
    document.addEventListener('keydown', e => {
      if ($('overlay').hidden && (e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !/input|textarea/i.test(e.target.tagName)) handlers.onEndTurn();
    });
  }

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function renderHud(g, v) {
    // timeline of years
    const tl = $('timeline'); let h = '';
    for (let y = C.startYear; y <= C.endYear; y++) {
      const cls = y < g.year ? 'done' : y === g.year ? 'now' : '';
      let pips = '';
      if (y === g.year) { for (let i = 1; i <= C.turnsPerYear; i++) pips += '<i class="' + (i < g.turn ? 'p done' : i === g.turn ? 'p now' : 'p') + '"></i>'; }
      h += '<li class="' + cls + '"><span>' + y + '</span>' + (pips ? '<span class="pips">' + pips + '</span>' : '') + '</li>';
    }
    tl.innerHTML = h;
    $('cas').textContent = (g.casualties * C.menPerStrength).toLocaleString();
    const m = Math.max(0, Math.round(g.morale));
    $('mor-fill').style.width = m + '%';
    $('mor-fill').className = m > 60 ? '' : m > 30 ? 'mid' : 'low';
    $('mor-bar').setAttribute('aria-valuenow', m);
    $('mor-bar').title = 'Home-front morale: ' + m + '%';
    // goal distance
    let best = null;
    for (const u of g.units) if (u.side === 'allied' && u.type !== 'artillery' && u.type !== 'gas') for (const hub of C.hubs) { const d = M.distance(u.r, u.c, hub.r, hub.c); if (best === null || d < best) best = d; }
    $('goal-text').innerHTML = best === 0 ? 'On the hub! <b>Hold it through the German turn.</b>' : 'Capture a \u2605 rail hub' + (best !== null ? ' <b>(' + best + ' away)</b>' : '');
    const sb = $('btn-sound'); sb.textContent = WF.Audio.isMuted() ? 'Sound off' : 'Sound on';
  }

  function renderAdvisor(adv) {
    const a = $('advisor');
    a.className = 'advisor ' + (adv.tone || 'info');
    const html = adv.text;
    if ($('advice').innerHTML !== html) $('advice').innerHTML = html;
  }

  function renderUnitCard(g, v) {
    const u = v.selected, box = $('unitcard');
    if (!u) { box.hidden = true; return; }
    box.hidden = false;
    const def = C.units[u.type], cell = g.map[u.r][u.c];
    let status = u.side === 'german' ? 'Enemy' : u.broken ? 'Broken down' : u.acted ? 'Done this turn' : 'Ready';
    const cover = cell.trench ? 'In a trench (level ' + cell.trench + '): ' + [0, 40, 60, 80][cell.trench] + '% less damage' : 'In the open: no protection';
    box.className = 'card-unit ' + u.side;
    box.innerHTML = '<div class="uicon">' + unitGlyph(u) + '</div><div class="ubody"><b>' + SIDE[u.side] + ' ' + def.name + '</b>' +
      '<span class="men">' + (u.strength * C.menPerStrength).toLocaleString() + ' men</span>' +
      '<span class="meta">' + status + ' · ' + cover + '</span><span class="role">' + def.role + '</span></div>';
  }

  function btn(a, icon, label, desc, active, disabled) {
    return '<button type="button" class="abtn' + (active ? ' on' : '') + '" data-a="' + a + '"' + (disabled ? ' disabled' : '') + '>' + glyph(icon) +
      '<span><b>' + label + '</b><small>' + desc + '</small></span></button>';
  }

  function renderActions(g, v) {
    const box = $('actions'), a = v.actions, u = v.selected;
    if (!u || u.side !== 'allied') { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    let h = '';
    if (a.move && (v.mode !== 'move')) h += btn('move', 'move', 'Move instead', 'Walk to a nearby square', false, false);
    if (a.dig) { const lvl = g.map[u.r][u.c].trench; h += btn('dig', 'dig', 'Dig in', 'Trench level ' + (lvl + 1) + ': ' + [0, 40, 60, 80][lvl + 1] + '% less damage', false, false) + ''; }
    else if (['infantry', 'machinegun', 'storm'].includes(u.type) && g.map[u.r][u.c].trench >= 3) h += btn('dig', 'dig', 'Fully dug in', 'Maximum trench level', false, true);
    if (u.type === 'artillery') {
      h += btn('bombard', 'artillery', 'Shell', 'Hit one square within 4', v.mode === 'bombard', !a.bombard);
      if (g.year >= C.bombard.long.unlockYear) h += btn('long', 'long', 'Long barrage', 'Heavy damage, but it warns the Germans', v.mode === 'long', !a.long);
    }
    if (u.type === 'gas') h += btn('gas', 'gas', 'Gas attack', 'One-time hit on 3 squares', v.mode === 'gas', !a.gas);
    if (a.hold) h += btn('hold', 'rest', g.map[u.r][u.c].trench ? 'Rest' : 'Skip', g.map[u.r][u.c].trench ? 'Recover 1,000 men in a trench' : 'End this unit\'s turn', false, false);
    box.innerHTML = h;
  }

  function renderRecruit(g, v) {
    const box = $('recruit'); let h = '<div class="rec-head"><b>Reinforcements</b><span>' + g.manpower + ' points</span></div><div class="rec-row">';
    for (const o of v.recruit) {
      h += '<button type="button" class="rbtn' + (v.recruitType === o.type ? ' on' : '') + '" data-t="' + o.type + '"' + (o.ok ? '' : ' disabled') + ' title="' + o.name + ': costs ' + o.cost + ' points">' +
        typeGlyph(o.type) + '<span>' + o.name + '</span><em>' + o.cost + '</em></button>';
    }
    box.innerHTML = h + '</div>';
  }

  function renderLog(g) {
    const ol = $('log'), msgs = g.log.slice(-30);
    if (g.log.length === lastLogLen) return;
    lastLogLen = g.log.length;
    ol.innerHTML = '';
    for (const m of msgs) { const li = document.createElement('li'); li.textContent = m.text; if (m.kind) li.className = m.kind; ol.appendChild(li); }
    ol.scrollTop = ol.scrollHeight;
  }

  function render(g, v, adv) {
    renderHud(g, v);
    renderAdvisor(adv);
    renderUnitCard(g, v);
    renderActions(g, v);
    renderRecruit(g, v);
    renderLog(g);
    const idle = g.units.filter(u => u.side === 'allied' && !u.acted && !u.broken).length;
    const e = $('endturn');
    e.disabled = g.over || v.locked;
    $('idle').textContent = idle ? idle + ' unit' + (idle === 1 ? '' : 's') + ' still can act' : 'all units have acted';
    e.classList.toggle('attn', !!adv.pulseEnd);
    for (const b of document.querySelectorAll('#actions button[data-a="dig"]')) b.classList.toggle('attn', !!adv.pulseDig);
  }

  // ---- tooltip / banner ----
  function showTip(html, x, y) {
    const t = $('tip'); t.innerHTML = html; t.hidden = false;
    const st = $('stage').getBoundingClientRect();
    let left = x - st.left + 16, top = y - st.top + 16;
    t.style.left = '0px'; t.style.top = '0px';
    const tw = t.offsetWidth, th = t.offsetHeight;
    if (left + tw > st.width - 8) left = x - st.left - tw - 16;
    if (top + th > st.height - 8) top = y - st.top - th - 16;
    t.style.left = Math.max(4, left) + 'px'; t.style.top = Math.max(4, top) + 'px';
  }
  function hideTip() { $('tip').hidden = true; }
  function banner(text, sub) {
    const b = $('banner'); b.innerHTML = '<b>' + text + '</b>' + (sub ? '<span>' + sub + '</span>' : '');
    b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 1500);
  }

  // ---- dialogs ----
  function card(o) {
    $('ov-kicker').textContent = o.kicker || ''; $('ov-kicker').hidden = !o.kicker;
    $('ov-title').textContent = o.title; $('ov-body').innerHTML = o.html || '';
    $('overlay').className = o.className || '';
    const b = $('ov-btn'); b.textContent = o.button || 'OK';
    b.onclick = () => { $('overlay').hidden = true; o.onClick && o.onClick(); };
    const c = $('ov-cancel'); c.hidden = !o.cancel; c.textContent = o.cancel || '';
    c.onclick = () => { $('overlay').hidden = true; o.onCancel && o.onCancel(); };
    $('overlay').hidden = false;
    document.querySelector('#overlay .sheet').scrollTop = 0;
    b.focus({ preventScroll: true });
  }

  function endScreen(sum, onAgain) {
    const stats = sum.stats.map(r => '<div class="big"><b>' + r[1] + '</b><span>' + r[0] + '</span></div>').join('');
    card({
      kicker: sum.type === 'armistice' ? 'November 11, 1918' : sum.type === 'breakthrough' ? 'Victory' : 'Defeat',
      title: sum.title, className: 'ending ' + sum.type,
      html: '<p class="lead">' + sum.lead + '</p><div class="bigs">' + stats + '</div>' +
        '<h3>How does that compare?</h3><ul>' + sum.comparisons.map(c => '<li>' + c + '</li>').join('') + '</ul>' +
        '<h3>Think about it</h3><ol>' + sum.questions.map(q => '<li>' + q + '</li>').join('') + '</ol>',
      button: 'Play again', onClick: onAgain,
    });
  }

  return { init, render, showTip, hideTip, banner, card, endScreen, glyph, typeGlyph };
})();
