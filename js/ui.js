// DOM panels: HUD, sergeant, unit card, action buttons, recruits, log, dialogs, tooltip.
// No game rules live here.
globalThis.WF = globalThis.WF || {};

WF.UI = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units, N = WF.Names;
  const openWhy = new Set();
  const $ = id => document.getElementById(id);
  let handlers = {}, bannerTimer = null, lastLogLen = -1;
  const ICON = {
    dig: 'M17.5 2.5l4 4-2 2-4-4zM14.5 5.5l4 4L11 17.5 6.5 19l-1-1.5L7 13z',
    rest: 'M6 4h4v16H6zM14 4h4v16h-4z',
    move: 'M12 2l7 8h-4.5v12h-5V10H5z',
    long: 'M2.5 14.5 15 5.2l2.4 3.1L5 17.6zM21 3l1 5-2-1-2 3-1-5 2 1z',
  };
  const glyph = (key, cls) => '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="' + (WF.GLYPH[key] || ICON[key]) + '"/></svg>';
  const helmet = (g, side) => (N.faction(g, side) === 'german' ? 'infantryGerman' : 'infantryAllied');
  const unitGlyph = (g, u) => glyph(u.type === 'infantry' ? helmet(g, u.side) : u.type);
  const typeGlyph = (g, t) => glyph(t === 'infantry' ? helmet(g, 'allied') : t);

  function init(h) {
    handlers = h;
    $('endturn').addEventListener('click', () => handlers.onEndTurn());
    $('btn-help').addEventListener('click', () => handlers.onHelp());
    $('btn-zoom').addEventListener('click', () => handlers.onZoom());
    $('btn-sound').addEventListener('click', () => handlers.onSound());
    $('btn-full').addEventListener('click', () => handlers.onFull());
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
    $('goal-text').innerHTML = best === 0 ? 'On the hub! <b>Hold it through the enemy turn.</b>' : 'Capture a \u2605 rail hub' + (best !== null ? ' <b>(' + best + ' away)</b>' : '');
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
    box.innerHTML = '<div class="uicon">' + unitGlyph(g, u) + '</div><div class="ubody"><b>' + N.adj(g, u.side) + ' ' + def.name + '</b>' +
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
      if (g.year >= C.bombard.long.unlockYear) h += btn('long', 'long', 'Long barrage', 'Heavy damage, but it warns the enemy', v.mode === 'long', !a.long);
    }
    if (u.type === 'gas') h += btn('gas', 'gas', 'Gas attack', 'One-time hit on 3 squares', v.mode === 'gas', !a.gas);
    if (a.hold) h += btn('hold', 'rest', g.map[u.r][u.c].trench ? 'Rest' : 'Skip', g.map[u.r][u.c].trench ? 'Recover 1,000 men in a trench' : 'End this unit\'s turn', false, false);
    box.innerHTML = h;
  }

  function renderRecruit(g, v) {
    const box = $('recruit'); let h = '<div class="rec-head"><b>Reinforcements</b><span>' + g.manpower + ' points</span></div><div class="rec-row">';
    for (const o of v.recruit) {
      h += '<button type="button" class="rbtn' + (v.recruitType === o.type ? ' on' : '') + '" data-t="' + o.type + '"' + (o.ok ? '' : ' disabled') + ' title="' + o.name + ': costs ' + o.cost + ' points">' +
        typeGlyph(g, o.type) + '<span>' + o.name + '</span><em>' + o.cost + '</em></button>';
    }
    box.innerHTML = h + '</div>';
  }

  function renderLog(g) {
    const ol = $('log'), msgs = g.log.slice(-40), base = g.log.length - msgs.length;
    if (g.log.length === lastLogLen) return;
    lastLogLen = g.log.length;
    ol.innerHTML = '';
    msgs.forEach((m, i) => {
      const li = document.createElement('li'); if (m.kind) li.className = m.kind;
      if (m.why) {
        const id = base + i, open = openWhy.has(id);
        li.classList.add('has-why');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'why-btn'; b.setAttribute('aria-expanded', open);
        b.innerHTML = '<span></span><i>Why?</i>'; b.firstChild.textContent = m.text;
        const w = document.createElement('div'); w.className = 'why'; w.textContent = m.why; w.hidden = !open;
        b.addEventListener('click', () => { const o = w.hidden; w.hidden = !o; b.setAttribute('aria-expanded', o); o ? openWhy.add(id) : openWhy.delete(id); });
        li.appendChild(b); li.appendChild(w);
      } else li.textContent = m.text;
      ol.appendChild(li);
    });
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
    const bar = document.querySelector('#overlay .sheet-buttons');
    for (const x of bar.querySelectorAll('.extra')) x.remove();
    if (o.choices) {
      const wrap = document.createElement('div'); wrap.className = 'choices';
      for (const ch of o.choices) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'choice';
        b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = ch.label; b.lastChild.textContent = ch.sub;
        b.onclick = () => { $('overlay').hidden = true; ch.onClick(); };
        wrap.appendChild(b);
      }
      $('ov-body').appendChild(wrap);
    }
    const b = $('ov-btn'); b.hidden = !!o.choices; b.textContent = o.button || 'OK';
    b.onclick = () => { $('overlay').hidden = true; o.onClick && o.onClick(); };
    for (const ex of o.extra || []) {
      const eb = document.createElement('button'); eb.type = 'button'; eb.className = 'btn ghost extra'; eb.textContent = ex.label;
      eb.onclick = () => ex.onClick(); bar.insertBefore(eb, b);
    }
    const c = $('ov-cancel'); c.hidden = !o.cancel; c.textContent = o.cancel || '';
    c.onclick = () => { $('overlay').hidden = true; o.onCancel && o.onCancel(); };
    $('overlay').hidden = false;
    document.querySelector('#overlay .sheet').scrollTop = 0;
    (o.choices ? document.querySelector('#overlay .choice') : b).focus({ preventScroll: true });
  }

  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function copyText(text, status) {
    const fallback = () => {
      let box = document.getElementById('copy-box');
      if (!box) { box = document.createElement('textarea'); box.id = 'copy-box'; box.readOnly = true; box.rows = 8; document.getElementById('ov-body').appendChild(box); }
      box.value = text; box.select(); status.textContent = 'Press Ctrl+C (or Cmd+C) to copy the text above.';
    };
    try { navigator.clipboard.writeText(text).then(() => { status.textContent = 'Copied. Paste it into your document.'; }, fallback); } catch (e) { fallback(); }
  }

  function endScreen(sum, onAgain, g) {
    const stats = sum.stats.map(r => '<div class="big"><b>' + esc(r[1]) + '</b><span>' + esc(r[0]) + '</span></div>').join('');
    const causes = sum.causes.length ? '<h3>Where your losses came from</h3><div class="causes">' + sum.causes.map(c =>
      '<div class="cause"><span>' + esc(c.label) + '</span><div class="cbar"><i style="width:' + Math.max(3, Math.round(c.share * 100)) + '%"></i></div><b>' + c.men.toLocaleString() + '</b></div>').join('') + '</div>' : '';
    const moments = sum.moments.length ? '<h3>Key moments</h3><ul class="moments">' + sum.moments.map(m => '<li><b>' + esc(m.label) + '</b> ' + esc(m.text) + '</li>').join('') + '</ul>' : '';
    const qa = sum.questions.map((q, i) => '<div class="qa"><label for="qa-' + i + '">' + (i + 1) + '. ' + esc(q.q) + '</label><div class="qdata">Your game: ' + esc(q.data) + '</div>' +
      '<textarea id="qa-' + i + '" rows="3" placeholder="Answer in your own words, using your results above."></textarea></div>').join('');
    card({
      kicker: sum.type === 'armistice' ? 'November 11, 1918' : sum.type === 'breakthrough' ? 'Victory' : 'Defeat',
      title: sum.title, className: 'ending ' + sum.type,
      html: '<p class="lead">' + sum.lead + '</p><div class="bigs">' + stats + '</div>' + causes + moments +
        '<h3>How does that compare?</h3><ul>' + sum.comparisons.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
        '<h3>Debrief: answer these using your game</h3>' + qa +
        '<div class="who-field"><label for="qa-name">Your name (optional, for your copy only)</label><input id="qa-name" type="text" maxlength="60" autocomplete="off"></div>' +
        '<p id="copy-status" class="dim" aria-live="polite">When you are done, press Copy my results and paste them into your assignment.</p>',
      extra: [{ label: 'Copy my results', onClick: () => {
        const answers = sum.questions.map((q, i) => (document.getElementById('qa-' + i) || {}).value || '');
        copyText(WF.Years.report(sum, answers, (document.getElementById('qa-name') || {}).value || ''), document.getElementById('copy-status'));
      } }],
      button: 'Play again', onClick: onAgain,
    });
  }

  return { init, render, showTip, hideTip, banner, card, endScreen, glyph };
})();
