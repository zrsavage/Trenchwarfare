// Canvas renderer: painted battlefield, unit sprites, animations and mouse/keyboard input.
// The map is drawn rotated so it fits a landscape screen: the Allied rear is at the bottom,
// the Germans are at the top, the English Channel is on the left, Switzerland on the right.
globalThis.WF = globalThis.WF || {};

WF.GLYPH = {   // 24x24 icon paths, shared with the DOM panels
  infantryAllied: 'M4 14C4 7.5 8.5 4 12 4s8 3.5 8 10zM2.5 14.5h19v2.3h-19zM5 22c0-3.6 3-5.4 7-5.4s7 1.8 7 5.4z',
  infantryGerman: 'M4 14C4 7.5 8.5 5 12 5s8 2.5 8 9zM11.1 1.2h1.8V5h-1.8zM2.5 14.5h19v2.3h-19zM5 22c0-3.6 3-5.4 7-5.4s7 1.8 7 5.4z',
  machinegun: 'M1.5 8.5h13.5v3.4H1.5zM15 7h5.5v6.5H15zM15.5 13.5l-4.2 7.5h2.3l3.2-5.6 3.5 5.6h2.3l-4.6-7.5zM3 6.2h5v1.6H3z',
  artillery: 'M2.5 14.5 15 5.2l2.4 3.1L5 17.6zM18.5 17.5a5.2 5.2 0 1 0-10.4 0 5.2 5.2 0 1 0 10.4 0zm-3.2 0a2 2 0 1 1-4 0 2 2 0 1 1 4 0z',
  gas: 'M6.5 18.5a4.2 4.2 0 0 1-.4-8.4A5.8 5.8 0 0 1 17 8.7a4.9 4.9 0 0 1 .9 9.8zM8 21.5h2v1.3H8zM13.5 21.5h2v1.3h-2z',
  tank: 'M2.5 14h19v4.6a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3zM7 8.8h8.3v5H7zM15 9.6h8v2H15z',
  storm: 'M13.4 1.5 4.5 13.4h5.7L8.6 22.5l10.2-12.4h-5.9z',
  hub: 'M12 1.5 14.9 8.6 22.5 9.2 16.7 14.2 18.5 21.6 12 17.6 5.5 21.6 7.3 14.2 1.5 9.2 9.1 8.6z',
};

WF.Render = (function () {
  const C = WF.CONFIG, M = WF.Map, U = WF.Units;
  const ROWS = C.rows, COLS = C.cols;
  const TAU = Math.PI * 2;
  const paths = {};
  let canvas, ctx, wrap, dpr = 1, S = 44, seaW = 22, W = 0, H = 0, zoom = 1, flip = false, lastPlayer = null, meName = 'ALLIED', foeName = 'GERMAN';
  let bg = null, hatch = null, view = null, handlers = {};
  const sprites = new Map(), fx = [];
  let flashT0 = -9999;
  let queue = [], pendingDie = new Set(), idleCbs = [], hover = null, cursor = null, shake = 0, lastTs = 0;
  const now = () => performance.now();

  // ---- geometry ----
  const px = r => seaW + (flip ? ROWS - 1 - r : r) * S;
  const py = c => (COLS - 1 - c) * S;
  const centre = (r, c) => ({ x: px(r) + S / 2, y: py(c) + S / 2 });
  function cellAt(x, y) {
    let r = Math.floor((x - seaW) / S); const c = COLS - 1 - Math.floor(y / S);
    if (flip) r = ROWS - 1 - r;
    return M.inBounds(r, c) ? { r, c } : null;
  }
  const hash = (r, c, k) => { const v = Math.sin(r * 12.9898 + c * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
  const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const clamp01 = t => Math.min(1, Math.max(0, t));

  // ---- background (ground, sea, mountains, labels), drawn once per resize ----
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx_ = x - ix, fy = y - iy;
    const sx = fx_ * fx_ * (3 - 2 * fx_), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c2 = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
  }
  const STOPS = [[0, [101, 134, 66]], [3.2, [118, 138, 72]], [4.2, [138, 122, 80]], [6, [128, 102, 68]],
                 [8.2, [124, 104, 72]], [9.4, [116, 114, 86]], [12, [106, 110, 90]]];
  function groundColour(cc) {
    for (let i = 1; i < STOPS.length; i++) {
      if (cc <= STOPS[i][0]) {
        const a = STOPS[i - 1], b = STOPS[i], t = (cc - a[0]) / (b[0] - a[0]);
        return a[1].map((v, k) => v + (b[1][k] - v) * t);
      }
    }
    return STOPS[STOPS.length - 1][1];
  }


  // ---- scenery: trees behind the lines, tracks, ruined farms, dead trunks ----
  function tree(b, x, y, r) {
    b.fillStyle = 'rgba(0,0,0,.25)'; b.beginPath(); b.ellipse(x + r * 0.5, y + r * 0.7, r * 1.1, r * 0.55, 0, 0, TAU); b.fill();
    const cols = ['#2f5a2a', '#3b6b31', '#2a4f26'];
    for (let i = 0; i < 3; i++) { b.fillStyle = cols[i]; b.beginPath(); b.arc(x + (i - 1) * r * 0.6, y - (i === 1 ? r * 0.35 : 0), r * (0.8 + 0.15 * (i === 1)), 0, TAU); b.fill(); }
    b.fillStyle = 'rgba(190,230,140,.25)'; b.beginPath(); b.arc(x - r * 0.2, y - r * 0.6, r * 0.4, 0, TAU); b.fill();
  }
  function drawProps(b) {
    // dirt tracks running up to the front
    b.save(); b.lineCap = 'round';
    for (const tr of [4.5, 11.5]) {
      b.strokeStyle = 'rgba(205,180,130,.32)'; b.lineWidth = S * 0.34; b.beginPath();
      for (let c = -0.5; c <= 4.2; c += 0.25) { const x = seaW + (tr + Math.sin(c * 1.7 + tr) * 0.45) * S, y = (COLS - c) * S; c < -0.4 ? b.moveTo(x, y) : b.lineTo(x, y); }
      b.stroke();
      b.strokeStyle = 'rgba(90,70,40,.25)'; b.lineWidth = 2; b.setLineDash([S * 0.2, S * 0.2]); b.stroke(); b.setLineDash([]);
    }
    b.restore();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = px(r), y = py(c), h = hash(r, c, 21);
      if ((c <= 1 || c === 11) && h > 0.6 && !(c === 10)) { const k = hash(r, c, 22); tree(b, x + S * (0.2 + 0.6 * k), y + S * (0.25 + 0.5 * hash(r, c, 23)), S * (0.13 + 0.06 * hash(r, c, 24))); if (h > 0.85) tree(b, x + S * 0.75, y + S * 0.3, S * 0.12); }
      if (c >= 4 && c <= 8 && h > 0.93) {          // shattered trunk
        b.strokeStyle = '#2b2118'; b.lineWidth = S * 0.05; b.lineCap = 'round'; b.beginPath(); b.moveTo(x + S * 0.5, y + S * 0.8); b.lineTo(x + S * 0.48, y + S * 0.35); b.lineTo(x + S * 0.6, y + S * 0.2); b.moveTo(x + S * 0.48, y + S * 0.5); b.lineTo(x + S * 0.3, y + S * 0.38); b.stroke();
      }
    }
    // a few ruined farmhouses in the contested ground
    for (const [r, c] of [[2, 5], [13, 6], [6, 7], [10, 4]]) {
      const x = px(r) + S * 0.08, y = py(c) + S * 0.12, w = S * 0.5, hh = S * 0.34;
      b.fillStyle = 'rgba(0,0,0,.25)'; b.fillRect(x + 3, y + 4, w, hh);
      b.fillStyle = '#9b8c78'; b.fillRect(x, y, w, hh);
      b.fillStyle = '#6e3b2c'; b.beginPath(); b.moveTo(x - 3, y + 2); b.lineTo(x + w * 0.45, y - S * 0.12); b.lineTo(x + w * 0.62, y + 2); b.lineTo(x + w * 0.5, y + hh * 0.4); b.lineTo(x + 3, y + hh * 0.35); b.closePath(); b.fill();
      b.fillStyle = '#2a2018'; b.fillRect(x + w * 0.62, y + hh * 0.3, w * 0.3, hh * 0.7);
    }
  }

  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = Math.ceil(W * dpr); bg.height = Math.ceil(H * dpr);
    const b = bg.getContext('2d');
    // low-resolution noisy ground, scaled up smoothly
    const lw = Math.ceil(W / 5), lh = Math.ceil(H / 5);
    const low = document.createElement('canvas'); low.width = lw; low.height = lh;
    const lc = low.getContext('2d'), img = lc.createImageData(lw, lh);
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const X = x * 5 / S, Y = y * 5 / S, cc = COLS - Y;
        let [r, g, bl] = groundColour(cc);
        const n1 = vnoise(X * 1.1, Y * 1.1, 3), n2 = vnoise(X * 3.7, Y * 3.7, 9);
        const v = (n1 - 0.5) * 34 + (n2 - 0.5) * 16;
        r += v; g += v * 0.95; bl += v * 0.7;
        if (cc > 3.6 && cc < 9.2 && n1 > 0.58) { const m = (n1 - 0.58) * 2.2; r -= 28 * m; g -= 36 * m; bl -= 22 * m; }
        if (cc < 3.2 && n2 > 0.62) { g += 10; r -= 8; }
        const i = (y * lw + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bl; img.data[i + 3] = 255;
      }
    }
    lc.putImageData(img, 0, 0);
    b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
    b.drawImage(low, 0, 0, bg.width, bg.height);
    b.scale(dpr, dpr);

    // grain
    const gr = document.createElement('canvas'); gr.width = gr.height = 96;
    const gc = gr.getContext('2d'), gd = gc.createImageData(96, 96);
    for (let i = 0; i < gd.data.length; i += 4) { const v = Math.random() * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 22; }
    gc.putImageData(gd, 0, 0);
    b.fillStyle = b.createPattern(gr, 'repeat'); b.fillRect(0, 0, W, H);

    // zone washes + faint labels
    b.fillStyle = 'rgba(60,110,200,.07)'; b.fillRect(seaW, py(3), ROWS * S, 4 * S);
    b.fillStyle = 'rgba(30,30,30,.10)'; b.fillRect(seaW, 0, ROWS * S, 3 * S);
    b.textAlign = 'center'; b.textBaseline = 'middle';
    b.font = '700 ' + Math.round(S * 0.8) + 'px Oswald, Impact, sans-serif';
    b.fillStyle = 'rgba(255,255,255,.13)';
    b.fillText("N O   M A N ' S   L A N D", W / 2, py(6.5) + S * 0.5);
    b.font = '700 ' + Math.round(S * 0.42) + 'px Oswald, Impact, sans-serif';
    const sp = t => t.split('').join(' ');
    b.fillStyle = 'rgba(120,180,255,.55)'; b.fillText(sp(meName) + '   ' + sp('REAR'), W / 2, py(0) + S * 0.5);
    b.fillStyle = 'rgba(255,255,255,.35)'; b.fillText(sp(foeName) + '   ' + sp('REAR'), W / 2, py(11) + S * 0.5);

    drawProps(b);

    // sea (left, or right when the map is turned for the German player)
    const seaX = flip ? W - seaW : 0, mtnX = flip ? 0 : W - seaW;
    const sg = b.createLinearGradient(seaX, 0, seaX + seaW, 0);
    if (flip) { sg.addColorStop(0, '#2f7aa8'); sg.addColorStop(1, '#16405f'); } else { sg.addColorStop(0, '#16405f'); sg.addColorStop(1, '#2f7aa8'); }
    b.fillStyle = sg; b.fillRect(seaX, 0, seaW, H);
    b.strokeStyle = 'rgba(255,255,255,.35)'; b.lineWidth = 1.5;
    for (let y = 8; y < H; y += 18) { b.beginPath(); for (let x = 3; x < seaW - 3; x += 8) { b.moveTo(seaX + x, y + ((x / 8) % 2) * 3); b.quadraticCurveTo(seaX + x + 4, y - 3, seaX + x + 8, y + ((x / 8) % 2 ? 0 : 3)); } b.stroke(); }
    b.fillStyle = '#e8d9a8'; b.fillRect(flip ? seaX : seaW - 3, 0, 3, H);                         // beach
    b.save(); b.translate(seaX + seaW / 2, H / 2); b.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
    b.fillStyle = 'rgba(255,255,255,.85)'; b.font = '600 ' + Math.round(seaW * 0.55) + 'px Oswald, sans-serif'; b.fillText('E N G L I S H   C H A N N E L', 0, 0); b.restore();

    // mountains
    b.fillStyle = '#56634f'; b.fillRect(mtnX, 0, seaW, H);
    for (let y = 0; y < H; y += S * 1.1) {
      const h = seaW * (0.45 + 0.3 * hash(1, y, 4)), dir = flip ? -1 : 1, base = flip ? mtnX + seaW : mtnX;
      b.fillStyle = '#7a8790'; b.beginPath(); b.moveTo(base, y + S * 1.1); b.lineTo(base + dir * h, y + S * 0.55); b.lineTo(base, y); b.closePath(); b.fill();
      b.fillStyle = '#f2f5f7'; b.beginPath(); b.moveTo(base + dir * h, y + S * 0.55); b.lineTo(base + dir * h * 0.62, y + S * 0.36); b.lineTo(base + dir * h * 0.62, y + S * 0.74); b.closePath(); b.fill();
    }
    b.save(); b.translate(mtnX + seaW / 2, H / 2); b.rotate(flip ? -Math.PI / 2 : Math.PI / 2);
    b.lineWidth = 4; b.strokeStyle = 'rgba(20,30,20,.9)'; b.font = '600 ' + Math.round(seaW * 0.55) + 'px Oswald, sans-serif'; b.strokeText('S W I T Z E R L A N D', 0, 0); b.fillStyle = '#fff'; b.fillText('S W I T Z E R L A N D', 0, 0); b.restore();

    // grid + coordinates
    b.strokeStyle = 'rgba(0,0,0,.12)'; b.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) { b.beginPath(); b.moveTo(px(r), 0); b.lineTo(px(r), H); b.stroke(); }
    for (let c = 0; c <= COLS; c++) { b.beginPath(); b.moveTo(seaW, c * S); b.lineTo(seaW + ROWS * S, c * S); b.stroke(); }
    b.font = '600 ' + Math.max(9, Math.round(S * 0.2)) + 'px Atkinson Hyperlegible, sans-serif';
    b.fillStyle = 'rgba(255,255,255,.55)'; b.textAlign = 'left'; b.textBaseline = 'top';
    for (let r = 0; r < ROWS; r++) b.fillText(String(r + 1), px(r) + 3, 2);
    b.textBaseline = 'bottom';
    for (let c = 0; c < COLS; c++) b.fillText('ABCDEFGHIJKL'[c], px(0) + 3, py(c) + S - 2);

    hatch = document.createElement('canvas'); hatch.width = hatch.height = 16;
    const hc = hatch.getContext('2d'); hc.strokeStyle = 'rgba(235,45,40,.95)'; hc.lineWidth = 3;
    hc.beginPath(); hc.moveTo(-2, 18); hc.lineTo(18, -2); hc.moveTo(-10, 10); hc.lineTo(10, -10); hc.moveTo(6, 26); hc.lineTo(26, 6); hc.stroke();
  }

  // ---- sizing ----
  function resize() {
    if (!canvas || !wrap) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const cs = getComputedStyle(wrap), aw = Math.max(320, wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), ah = Math.max(240, wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    // width = ROWS*S + 2*seaW with seaW = 0.42 S  ->  16.84 S
    S = Math.max(22, Math.floor(Math.min(aw / (ROWS + 0.84), ah / COLS) * zoom));
    seaW = Math.round(S * 0.42);
    W = ROWS * S + seaW * 2; H = COLS * S;
    canvas.width = Math.ceil(W * dpr); canvas.height = Math.ceil(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    buildBackground();
    for (const sp of sprites.values()) { const c = sp.u ? centre(sp.u.r, sp.u.c) : null; if (c) { sp.x = sp.tx = c.x; sp.y = sp.ty = c.y; } }
  }

  // ---- sprites ----
  function glyphPath(key) { return paths[key] || (paths[key] = new Path2D(WF.GLYPH[key])); }
  const glyphKey = u => (u.type === 'infantry' ? (u.faction === 'german' ? 'infantryGerman' : 'infantryAllied') : u.type);

  function sync(g) {
    const seen = new Set(), t = now();
    for (const u of g.units) {
      seen.add(u.id);
      const c = centre(u.r, u.c);
      let sp = sprites.get(u.id);
      if (!sp) { sp = { id: u.id, x: c.x, y: c.y, appear: t, hold: false, ds: u.strength, gone: false, flash: 0 }; sprites.set(u.id, sp); }
      sp.u = { inTrench: g.map[u.r][u.c].trench > 0, faction: WF.Names.faction(g, u.side), type: u.type, side: u.side, r: u.r, c: u.c, strength: u.strength, max: u.max, acted: u.acted, broken: u.broken };
      sp.tx = c.x; sp.ty = c.y; sp.gone = false;
    }
    for (const [id, sp] of sprites) if (!seen.has(id) && !sp.gone) { sp.gone = true; sp.goneAt = t; }
  }

  function update(dt) {
    const t = now();
    // fire queued events
    while (queue.length && queue[0].at <= t) fire(queue.shift());
    if (!queue.length) for (const sp of sprites.values()) sp.hold = false;
    if (!isBusy() && idleCbs.length) { const cbs = idleCbs; idleCbs = []; cbs.forEach(f => f()); }
    for (const [id, sp] of sprites) {
      const dx = sp.tx - sp.x, dy = sp.ty - sp.y, d = Math.hypot(dx, dy);
      if (d > 0.5) { const step = Math.min(d, Math.max(S * 3.2 * dt, d * 6 * dt)); sp.x += dx / d * step; sp.y += dy / d * step; } else { sp.x = sp.tx; sp.y = sp.ty; }
      if (sp.gone && !pendingDie.has(id) && !sp.dying && t - sp.goneAt > 50) { sp.dying = true; sp.dieAt = t; }
      if (sp.dying && t - sp.dieAt > 650) sprites.delete(id);
    }
    for (let i = fx.length - 1; i >= 0; i--) if (t - fx[i].t0 > fx[i].dur) fx.splice(i, 1);
    shake *= Math.pow(0.002, dt);
  }

  // ---- event scheduling ----
  const GAP = { mg: 70, melee: 520, shell: 420, dig: 300, gas: 650, heal: 260, spawn: 250 };
  const LAG = { mg: 260, melee: 260, shell: 180, gas: 380 };
  function enqueue(events) {
    if (!events || !events.length) return;
    let cur = Math.max(now(), queue.length ? queue[queue.length - 1].at : 0), anchorAt = cur, lag = 0;
    let total = 0; for (const e of events) total += GAP[e.t] || 0;
    const scale = total > 5200 ? 5200 / total : 1;
    for (const e of events) {
      if (e.t === 'hit' || e.t === 'die') {
        e.at = anchorAt + lag * scale;
        if (e.t === 'die') pendingDie.add(e.id);
        if (e.t === 'hit') { const sp = sprites.get(e.id); if (sp && !sp.hold && sp.u) { sp.hold = true; sp.ds = sp.u.strength; } }
      } else {
        e.at = cur; anchorAt = cur; lag = LAG[e.t] || 0;
        cur += (GAP[e.t] || 0) * scale;
      }
      queue.push(e);
    }
    queue.sort((a, b) => a.at - b.at);
  }

  function addFx(o) { o.t0 = now(); fx.push(o); }

  function fire(e) {
    switch (e.t) {
      case 'shell': {
        const c = centre(e.r, e.c);
        addFx({ k: 'boom', x: c.x, y: c.y, big: e.big, dur: e.big ? 1100 : 800, seed: Math.random() * 99 });
        shake = Math.max(shake, e.big ? 9 : 5);
        WF.Audio.play(e.big ? 'boom' : 'boomSmall');
        break; }
      case 'mg': {
        const a = centre(e.from.r, e.from.c), b = centre(e.to.r, e.to.c);
        addFx({ k: 'tracer', a, b, dur: 420 }); WF.Audio.play('mg'); break; }
      case 'melee': {
        const a = sprites.get(e.a), a2 = centre(e.from.r, e.from.c), b = centre(e.to.r, e.to.c);
        if (a) { const dx = b.x - a2.x, dy = b.y - a2.y, d = Math.hypot(dx, dy) || 1; a.lunge = { x: dx / d * S * 0.4, y: dy / d * S * 0.4, t0: now(), dur: 420 }; }
        addFx({ k: 'clash', x: b.x, y: b.y, dur: 520, delay: 160 }); WF.Audio.play('clash'); break; }
      case 'hit': {
        const sp = sprites.get(e.id);
        if (sp) { sp.flash = now(); if (sp.hold) sp.ds = Math.max(0, sp.ds - e.n); }
        const c = sp ? { x: sp.x, y: sp.y } : centre(e.r, e.c);
        addFx({ k: 'float', x: c.x, y: c.y - S * 0.3, text: '-' + (e.n * 1000).toLocaleString(), col: e.side === 'allied' ? '#ff6b5e' : '#ffd36a', dur: 1500 });
        break; }
      case 'die': {
        pendingDie.delete(e.id); const sp = sprites.get(e.id);
        if (sp) { sp.dying = true; sp.dieAt = now(); }
        break; }
      case 'dig': {
        const c = centre(e.r, e.c); addFx({ k: 'dirt', x: c.x, y: c.y, dur: 700, seed: Math.random() * 50 }); WF.Audio.play('dig'); break; }
      case 'gas': {
        const cells = []; for (let d = -e.rows; d <= e.rows; d++) if (M.inBounds(e.r + d, e.c)) cells.push(centre(e.r + d, e.c));
        addFx({ k: 'gas', cells, dur: 1700, seed: Math.random() * 50 }); WF.Audio.play('gas'); break; }
      case 'heal': {
        const sp = sprites.get(e.id), c = sp ? { x: sp.x, y: sp.y } : centre(e.r, e.c);
        addFx({ k: 'float', x: c.x, y: c.y - S * 0.3, text: '+1,000', col: '#7be07b', dur: 1300 }); WF.Audio.play('heal'); break; }
      case 'spawn': { const sp = sprites.get(e.id); if (sp) sp.appear = now(); break; }
    }
  }

  // ---- drawing: terrain ----
  function trenchSide(cell) { return cell.dugBy === 'german' ? 1 : -1; }   // sandbags face the enemy

  function drawTrench(r, c, cell, x, y) {
    const lvl = cell.trench, cy = y + S / 2, w = S * (0.14 + 0.07 * lvl), d = S * 0.07;
    const pts = [[x, cy], [x + S * 0.25, cy - d], [x + S * 0.5, cy], [x + S * 0.75, cy + d], [x + S, cy]];
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
    // vertical links to neighbouring trench squares
    const link = (dc) => { const n = M.inBounds(r, c + dc) && (WF._game.map[r][c + dc].trench > 0); if (!n) return; ctx.beginPath(); ctx.moveTo(x + S / 2, cy); ctx.lineTo(x + S / 2, cy - dc * S / 2 - 0); ctx.stroke(); };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(40,28,16,.85)'; ctx.lineWidth = w + 5; path(); ctx.stroke(); link(1); link(-1);
    ctx.strokeStyle = lvl === 3 ? '#1a1209' : lvl === 2 ? '#2b1f12' : '#3c2c1a'; ctx.lineWidth = w; path(); ctx.stroke(); link(1); link(-1);
    if (lvl >= 2) { ctx.strokeStyle = 'rgba(190,150,90,.55)'; ctx.lineWidth = Math.max(1.5, w * 0.22); ctx.setLineDash([S * 0.09, S * 0.06]); path(); ctx.stroke(); ctx.setLineDash([]); }
    // sandbag parapet on the enemy-facing side
    const side = trenchSide(cell), bags = lvl === 1 ? 0 : 5, by = cy + side * (w / 2 + S * 0.06);
    ctx.strokeStyle = 'rgba(150,120,80,.95)'; ctx.lineWidth = S * 0.085; ctx.beginPath(); ctx.moveTo(x + S * 0.04, by); ctx.lineTo(x + S * 0.96, by); ctx.stroke();
    for (let i = 0; i < bags; i++) {
      ctx.fillStyle = i % 2 ? '#c9b98a' : '#b9a878';
      ctx.beginPath(); ctx.ellipse(x + S * (0.12 + i * 0.19), by, S * 0.09, S * 0.05, 0, 0, TAU); ctx.fill();
      if (lvl === 3) { ctx.fillStyle = '#a89868'; ctx.beginPath(); ctx.ellipse(x + S * (0.21 + i * 0.19) - (i === 4 ? S * 0.09 : 0), by + side * S * 0.07, S * 0.08, S * 0.045, 0, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawWire(x, y) {
    ctx.save(); ctx.strokeStyle = 'rgba(30,30,30,.9)'; ctx.fillStyle = '#2a2118'; ctx.lineWidth = 1.4;
    const cy = y + S / 2;
    for (const px_ of [0.14, 0.86]) ctx.fillRect(x + S * px_ - 1.5, cy - S * 0.2, 3, S * 0.4);
    for (const off of [-0.08, 0.08]) {
      ctx.beginPath(); for (let i = 0; i <= 8; i++) { const xx = x + S * (0.14 + i * 0.09), yy = cy + S * off + (i % 2 ? -1 : 1) * S * 0.07; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();
    }
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 6; i++) { const xx = x + S * (0.2 + i * 0.12), yy = cy + (i % 2 ? 1 : -1) * S * 0.05; ctx.beginPath(); ctx.moveTo(xx - 2.5, yy - 2.5); ctx.lineTo(xx + 2.5, yy + 2.5); ctx.moveTo(xx + 2.5, yy - 2.5); ctx.lineTo(xx - 2.5, yy + 2.5); ctx.stroke(); }
    ctx.restore();
  }

  function drawCraters(r, c, x, y) {
    const n = hash(r, c, 1) > 0.45 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cx = x + S * (0.28 + 0.44 * hash(r, c, 2 + i)), cy = y + S * (0.3 + 0.4 * hash(r, c, 5 + i)), rx = S * (0.17 + 0.12 * hash(r, c, 8 + i)), ry = rx * 0.78;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
      g.addColorStop(0, '#201810'); g.addColorStop(0.6, '#4a3925'); g.addColorStop(1, '#6a5238');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(235,210,160,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy - 0.5, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = 'rgba(120,150,170,.35)'; ctx.beginPath(); ctx.ellipse(cx + rx * 0.15, cy + ry * 0.2, rx * 0.4, ry * 0.3, 0, 0, TAU); ctx.fill();
    }
  }

  function drawRail(x, y) {
    const cy = y + S / 2;
    ctx.fillStyle = 'rgba(70,66,60,.55)'; ctx.fillRect(x, cy - S * 0.2, S, S * 0.4);
    ctx.fillStyle = '#4b3a26';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + S * (0.08 + i * 0.25), cy - S * 0.17, S * 0.07, S * 0.34);
    ctx.fillStyle = '#c8cdd0'; ctx.fillRect(x, cy - S * 0.1, S, 2); ctx.fillRect(x, cy + S * 0.08, S, 2);
  }

  function drawHub(x, y, t) {
    const cx = x + S / 2, cy = y + S / 2, pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const g = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * (0.7 + pulse * 0.15));
    g.addColorStop(0, 'rgba(255,215,90,.55)'); g.addColorStop(1, 'rgba(255,215,90,0)');
    ctx.fillStyle = g; ctx.fillRect(x - S * 0.3, y - S * 0.3, S * 1.6, S * 1.6);
    ctx.fillStyle = '#7a3b2b'; ctx.fillRect(x + S * 0.12, y + S * 0.12, S * 0.44, S * 0.3);          // station
    ctx.fillStyle = '#b4503a'; ctx.beginPath(); ctx.moveTo(x + S * 0.08, y + S * 0.14); ctx.lineTo(x + S * 0.34, y + S * 0.02); ctx.lineTo(x + S * 0.6, y + S * 0.14); ctx.fill();
    ctx.save(); ctx.translate(x + S * 0.52, y + S * 0.5); ctx.scale(S * 0.5 / 24, S * 0.5 / 24); ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#5a3d00'; ctx.lineWidth = 1.6; ctx.fill(glyphPath('hub')); ctx.stroke(glyphPath('hub')); ctx.restore();
  }

  function drawTerrain(g, t) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = g.map[r][c], x = px(r), y = py(c);
      if (cell.rail) drawRail(x, y);
      if (cell.crater) drawCraters(r, c, x, y);
      if (cell.trench) drawTrench(r, c, cell, x, y);
      if (cell.wire) drawWire(x, y);
      if (cell.hub) drawHub(x, y, t);
    }
  }

  function drawOwnership(g) {
    ctx.save();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const o = g.owner[r][c]; if (!o) continue;
      ctx.fillStyle = o === 'a' ? 'rgba(70,130,235,.09)' : 'rgba(25,25,25,.11)';
      ctx.fillRect(px(r), py(c), S, S);
    }
    ctx.lineWidth = 3; ctx.setLineDash([S * 0.16, S * 0.08]);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const o = g.owner[r][c]; if (!o) continue;
      ctx.strokeStyle = o === 'a' ? 'rgba(90,160,255,.95)' : 'rgba(35,35,35,.8)';
      const x = px(r), y = py(c), own = o;
      const edge = (nr, nc, x1, y1, x2, y2) => { if (!M.inBounds(nr, nc) || g.owner[nr][nc] === own) return; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      for (const nr of [r + 1, r - 1]) { if (!M.inBounds(nr, c)) continue; const bx = (px(r) + px(nr)) / 2 + S / 2; edge(nr, c, bx, y, bx, y + S); }
      edge(r, c + 1, x, y, x + S, y); edge(r, c - 1, x, y + S, x + S, y + S);
    }
    ctx.restore();
  }

  // ---- drawing: overlays ----
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const keyOf = (r, c) => r + ',' + c;

  function drawOverlays(v, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    if (v.kill && v.kill.size) {
      ctx.save(); ctx.fillStyle = ctx.createPattern(hatch, 'repeat'); ctx.globalAlpha = v.selected ? 0.6 : 0.4;
      for (const k of v.kill) { const [r, c] = k.split(',').map(Number); ctx.fillRect(px(r), py(c), S, S); }
      ctx.globalAlpha = v.selected ? 0.12 : 0.06; ctx.fillStyle = '#d02020';
      for (const k of v.kill) { const [r, c] = k.split(',').map(Number); ctx.fillRect(px(r), py(c), S, S); }
      ctx.restore();
    }
    if (v.range) for (const k of v.range.keys()) {
      const [r, c] = k.split(',').map(Number);
      ctx.fillStyle = 'rgba(255,190,60,' + (0.16 + 0.06 * pulse) + ')'; roundRect(px(r) + 2, py(c) + 2, S - 4, S - 4, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,80,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (v.reach) for (const [k, info] of v.reach) {
      const [r, c] = k.split(',').map(Number), x = px(r), y = py(c);
      ctx.fillStyle = 'rgba(90,170,255,' + (0.22 + 0.1 * pulse) + ')'; roundRect(x + 3, y + 3, S - 6, S - 6, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(170,215,255,.95)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x + S / 2, y + S / 2, S * 0.07, 0, TAU); ctx.fill();
      if (v.kill && v.kill.has(k)) { ctx.fillStyle = '#ff4a3c'; ctx.beginPath(); ctx.moveTo(x + S - 6, y + 5); ctx.lineTo(x + S - 14, y + 20); ctx.lineTo(x + S - 1, y + 20); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(S * 0.2) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x + S - 7.5, y + 16); }
    }
    if (v.place) for (const k of v.place) {
      const [r, c] = k.split(',').map(Number);
      ctx.fillStyle = 'rgba(110,235,130,' + (0.2 + 0.12 * pulse) + ')'; roundRect(px(r) + 3, py(c) + 3, S - 6, S - 6, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(160,255,175,.95)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (v.targets) for (const k of v.targets.keys()) {
      const [r, c] = k.split(',').map(Number), cc = centre(r, c), rad = S * (0.46 + 0.04 * pulse);
      ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cc.x, cc.y, rad, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2.5; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(cc.x + Math.cos(a) * (rad - 4), cc.y + Math.sin(a) * (rad - 4)); ctx.lineTo(cc.x + Math.cos(a) * (rad + 6), cc.y + Math.sin(a) * (rad + 6)); ctx.stroke(); }
    }
    // hover preview
    if (hover && v.game) {
      const k = keyOf(hover.r, hover.c), x = px(hover.r), y = py(hover.c);
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; roundRect(x + 1.5, y + 1.5, S - 3, S - 3, 6); ctx.stroke();
      if (v.range && v.range.has(k) && v.splash) {
        for (const [r, c] of v.splash(hover.r, hover.c)) { ctx.fillStyle = 'rgba(255,120,40,.35)'; roundRect(px(r) + 2, py(c) + 2, S - 4, S - 4, 6); ctx.fill(); }
      }
      if (v.reach && v.reach.has(k) && v.selected) {
        const u = v.selected, g = sprites.get(u.id);
        if (g) { ctx.save(); ctx.globalAlpha = 0.5; drawBadge(Object.assign({ faction: WF.Names.faction(v.game, u.side) }, u), x + S / 2, y + S / 2, 0, t, true); ctx.restore(); }
      }
    }
    if (cursor) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); roundRect(px(cursor.r) + 4, py(cursor.c) + 4, S - 8, S - 8, 6); ctx.stroke(); ctx.setLineDash([]); }
    // coach pulses
    if (v.pulses) for (const p of v.pulses) {
      const cc = centre(p.r, p.c), k = (t * 1.4) % 1;
      ctx.strokeStyle = 'rgba(255,225,80,' + (1 - k) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cc.x, cc.y, S * (0.4 + k * 0.55), 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffd24a'; const bob = Math.sin(t * 6) * 4, ay = cc.y - S * 0.62 + bob;
      ctx.beginPath(); ctx.moveTo(cc.x, ay + 4); ctx.lineTo(cc.x - 9, ay - 11); ctx.lineTo(cc.x + 9, ay - 11); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#5a3d00'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // ---- drawing: units ----
  function drawBadge(u, x, y, lift, t, ghost) {
    const rad = S * 0.4, allied = u.side === 'allied';
    ctx.save(); ctx.translate(x, y - lift);
    if (!ghost) { ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(0, rad * 0.95 + lift, rad * 0.95, rad * 0.32, 0, 0, TAU); ctx.fill(); }
    const g = ctx.createLinearGradient(0, -rad, 0, rad);
    if (allied) { g.addColorStop(0, '#4b8be0'); g.addColorStop(1, '#1f4f98'); } else { g.addColorStop(0, '#8b9482'); g.addColorStop(1, '#4e554a'); }
    ctx.fillStyle = g; ctx.lineWidth = 3;
    if (allied) { ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); }
    else { ctx.strokeStyle = '#1c1f1a'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + TAU / 16; const rr = rad * 1.08; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    if (!allied) { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2; ctx.save(); ctx.clip(); for (let i = -3; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-rad + i * 7, rad); ctx.lineTo(rad + i * 7, -rad); ctx.stroke(); } ctx.restore(); }
    ctx.save(); const gs = rad * 1.3; ctx.translate(-gs / 2, -gs / 2); ctx.scale(gs / 24, gs / 24);
    ctx.fillStyle = allied ? '#f4f8ff' : '#ecebdc'; ctx.fill(glyphPath(glyphKey(u)), u.type === 'artillery' ? 'evenodd' : 'nonzero'); ctx.restore();
    ctx.restore();
  }

  function drawUnit(sp, v, t) {
    const u = sp.u; if (!u) return;
    let x = sp.x, y = sp.y, alpha = 1, scale = 1;
    if (sp.lunge) { const k = (now() - sp.lunge.t0) / sp.lunge.dur; if (k >= 1) sp.lunge = null; else { const w = Math.sin(k * Math.PI); x += sp.lunge.x * w; y += sp.lunge.y * w; } }
    const ap = easeOut((now() - sp.appear) / 350); if (ap < 1) scale = 0.4 + 0.6 * ap + Math.sin(ap * Math.PI) * 0.15;
    if (sp.dying) { const k = clamp01((now() - sp.dieAt) / 600); alpha = 1 - k; scale = 1 - 0.25 * k; y += k * S * 0.15; }
    const selected = v.selected && v.selected.id === sp.id;
    const lift = selected ? 3 + Math.sin(t * 6) * 2 : 0;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-x, -y);
    if (selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.arc(x, y, S * 0.47, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill(); }
    if (v.danger && v.danger.has(sp.id)) { const p = 0.5 + 0.5 * Math.sin(t * 7); ctx.strokeStyle = 'rgba(255,60,50,' + (0.5 + 0.5 * p) + ')'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, S * (0.46 + 0.03 * p), 0, TAU); ctx.stroke(); }
    drawBadge(u, x, y, lift, t, false);
    if (sp.flash && now() - sp.flash < 260) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - (now() - sp.flash) / 260)) + ')'; ctx.beginPath(); ctx.arc(x, y - lift, S * 0.38, 0, TAU); ctx.fill(); }
    if (u.acted && u.side === 'allied' && !sp.dying) { ctx.fillStyle = 'rgba(30,35,40,.42)'; ctx.beginPath(); ctx.arc(x, y - lift, S * 0.37, 0, TAU); ctx.fill(); }
    // strength bar + number
    const str = sp.hold ? sp.ds : u.strength, max = Math.max(u.max || 10, str), ratio = clamp01(str / 10), bw = S * 0.74, bh = Math.max(4, S * 0.08), bx = x - bw / 2, by = y + S * 0.41;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; roundRect(bx - 1.5, by - 1.5, bw + 3, bh + 3, 3); ctx.fill();
    ctx.fillStyle = ratio > 0.55 ? '#62d04f' : ratio > 0.3 ? '#f2c230' : '#f0483c'; ctx.fillRect(bx, by, bw * ratio, bh);
    const nr = S * 0.17, nx = x + S * 0.34, ny = y - S * 0.34;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fill(); ctx.stroke();
    const sv = Math.max(0, Math.round(str)); ctx.fillStyle = '#111'; ctx.font = '800 ' + Math.round(nr * (sv >= 10 ? 0.98 : 1.25)) + 'px Atkinson Hyperlegible, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.max(0, Math.round(str))), nx, ny + 0.5);
    if (u.acted && u.side === 'allied' && !sp.dying) { ctx.fillStyle = '#7be07b'; ctx.font = '800 ' + Math.round(S * 0.26) + 'px sans-serif'; ctx.fillText('✓', x - S * 0.3, y - S * 0.3); }
    if (u.side === 'allied' && !u.acted && !sp.dying && u.strength < u.max && u.inTrench) {
      const hx = x - S * 0.34, hy = y + S * 0.02, hr = S * (0.12 + 0.015 * Math.sin(t * 5));
      ctx.fillStyle = '#2fa84a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(hx - hr * 0.6, hy - hr * 0.16, hr * 1.2, hr * 0.32); ctx.fillRect(hx - hr * 0.16, hy - hr * 0.6, hr * 0.32, hr * 1.2);
    }
    if (u.broken) { ctx.fillStyle = '#ff4a3c'; ctx.font = '800 ' + Math.round(S * 0.36) + 'px sans-serif'; ctx.fillText('✕', x, y); }
    ctx.restore();
  }

  // ---- drawing: effects ----
  function drawFx(t0) {
    const t = now();
    for (const f of fx) {
      const el = t - f.t0 - (f.delay || 0); if (el < 0) continue;
      const k = clamp01(el / (f.dur - (f.delay || 0)));
      ctx.save();
      if (f.k === 'boom') {
        const R = S * (f.big ? 1.5 : 0.95);
        ctx.fillStyle = 'rgba(255,240,200,' + (0.9 * (1 - k * 3 > 0 ? 1 - k * 3 : 0)) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.5 * easeOut(k * 2.5), 0, TAU); ctx.fill();
        const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, R * easeOut(k * 1.6) + 4); g.addColorStop(0, 'rgba(255,200,70,' + (0.95 * (1 - k)) + ')'); g.addColorStop(0.5, 'rgba(230,90,20,' + (0.7 * (1 - k)) + ')'); g.addColorStop(1, 'rgba(60,40,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R * easeOut(k * 1.6) + 4, 0, TAU); ctx.fill();
        for (let i = 0; i < (f.big ? 14 : 9); i++) { const a = hash(f.seed, i, 1) * TAU, d = R * (0.4 + hash(f.seed, i, 2)) * easeOut(k), s = S * 0.08 * (1 - k); ctx.fillStyle = 'rgba(70,50,32,' + (1 - k) + ')'; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - k * S * 0.2 + k * k * S * 0.4, s + 1, 0, TAU); ctx.fill(); }
        for (let i = 0; i < 5; i++) { const a = hash(f.seed, i, 5) * TAU, d = R * 0.5 * easeOut(k); ctx.fillStyle = 'rgba(50,48,46,' + (0.45 * (1 - k)) + ')'; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d * 0.6, f.y - k * S * 0.6 + Math.sin(a) * d * 0.3, S * (0.18 + 0.2 * k), 0, TAU); ctx.fill(); }
      } else if (f.k === 'tracer') {
        const head = clamp01(k * 1.6), tail = clamp01(k * 1.6 - 0.35);
        const hx = f.a.x + (f.b.x - f.a.x) * head, hy = f.a.y + (f.b.y - f.a.y) * head, tx = f.a.x + (f.b.x - f.a.x) * tail, ty = f.a.y + (f.b.y - f.a.y) * tail;
        ctx.strokeStyle = 'rgba(255,230,120,.95)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 7]); ctx.lineDashOffset = -el * 0.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
        if (k < 0.3) { ctx.fillStyle = 'rgba(255,240,170,' + (1 - k / 0.3) + ')'; ctx.beginPath(); ctx.arc(f.a.x, f.a.y, S * 0.2, 0, TAU); ctx.fill(); }
        if (k > 0.7) { ctx.fillStyle = 'rgba(255,200,90,' + (1 - (k - 0.7) / 0.3) + ')'; ctx.beginPath(); ctx.arc(f.b.x, f.b.y, S * 0.14, 0, TAU); ctx.fill(); }
      } else if (f.k === 'clash') {
        ctx.strokeStyle = 'rgba(255,245,200,' + (1 - k) + ')'; ctx.lineWidth = 3;
        for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + 0.3, d1 = S * 0.12 + k * S * 0.2, d2 = d1 + S * 0.22 * (1 - k); ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * d1, f.y + Math.sin(a) * d1); ctx.lineTo(f.x + Math.cos(a) * d2, f.y + Math.sin(a) * d2); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - k * 2 > 0 ? 1 - k * 2 : 0)) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, S * 0.25, 0, TAU); ctx.fill();
      } else if (f.k === 'dirt') {
        for (let i = 0; i < 12; i++) { const a = hash(f.seed, i, 3) * TAU, d = S * (0.1 + 0.4 * hash(f.seed, i, 4)) * easeOut(k); ctx.fillStyle = 'rgba(86,62,38,' + (1 - k) + ')'; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - Math.sin(k * Math.PI) * S * 0.3, S * 0.05 + 1, 0, TAU); ctx.fill(); }
      } else if (f.k === 'gas') {
        for (const c of f.cells) for (let i = 0; i < 7; i++) { const a = hash(f.seed, i, 6) * TAU + el * 0.0008, d = S * 0.35 * hash(f.seed, i, 7); ctx.fillStyle = 'rgba(150,220,70,' + (0.33 * Math.sin(k * Math.PI)) + ')'; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, S * (0.3 + 0.18 * easeOut(k)), 0, TAU); ctx.fill(); }
      } else if (f.k === 'float') {
        const yy = f.y - easeOut(k) * S * 0.7;
        ctx.globalAlpha = 1 - clamp01((k - 0.6) / 0.4); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + Math.round(S * 0.5) + 'px Oswald, Impact, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(f.sub || f.text, f.x, yy); ctx.fillStyle = f.col; ctx.fillText(f.sub || f.text, f.x, yy);
      }
      ctx.restore();
    }
  }

  // ---- frame loop ----
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!ctx || !view || !bg) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
    update(dt);
    const t = ts / 1000, g = view.game;
    ctx.setTransform(dpr, 0, 0, dpr, (Math.random() - 0.5) * shake * dpr, (Math.random() - 0.5) * shake * dpr);
    ctx.clearRect(-20, -20, W + 40, H + 40);
    ctx.drawImage(bg, 0, 0, W, H);
    WF._game = g;
    drawOwnership(g); drawTerrain(g, t);
    const tint = TINT[g.year]; if (tint) { ctx.fillStyle = tint; ctx.fillRect(seaW, 0, ROWS * S, H); }
    drawOverlays(view, t);
    const list = [...sprites.values()].sort((a, b) => a.y - b.y);
    for (const sp of list) drawUnit(sp, view, t);
    drawFx();
    drawAmbient(t, ts);
  }

  // ---- ambient: year colour grading, drifting smoke, distant gun flashes, vignette ----
  const TINT = { 1914: 'rgba(255,214,140,.07)', 1915: 'rgba(200,190,160,.05)', 1916: 'rgba(130,125,110,.10)', 1917: 'rgba(95,100,105,.15)', 1918: 'rgba(70,82,100,.17)' };
  let flashAt = 0, flashY = 0, flashX = 0;
  function drawAmbient(t, ts) {
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const x = ((t * (6 + i * 2) + i * 260) % (W + 300)) - 150, y = H * (0.15 + 0.17 * i) + Math.sin(t * 0.3 + i) * 20, r = S * (2.2 + i * 0.3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(210,205,195,.07)'); g.addColorStop(1, 'rgba(210,205,195,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (ts > flashAt) { flashAt = ts + 2500 + Math.random() * 4500; flashX = seaW + Math.random() * ROWS * S; flashY = Math.random() < 0.7 ? 0 : H; flashT0 = ts; }
    const fk = (ts - flashT0) / 380;
    if (fk >= 0 && fk < 1) { const g = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, S * 2.4); g.addColorStop(0, 'rgba(255,200,110,' + 0.35 * (1 - fk) + ')'); g.addColorStop(1, 'rgba(255,160,60,0)'); ctx.fillStyle = g; ctx.fillRect(flashX - S * 2.4, Math.max(0, flashY - S * 2.4), S * 4.8, S * 4.8); }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---- input ----
  function eventCell(e) {
    const rect = canvas.getBoundingClientRect();
    return cellAt((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height));
  }

  function init(cv, wr, h) {
    canvas = cv; wrap = wr; handlers = h; ctx = canvas.getContext('2d');
    canvas.addEventListener('mousemove', e => { hover = eventCell(e); handlers.onHover && handlers.onHover(hover, e.clientX, e.clientY); });
    canvas.addEventListener('mouseleave', () => { hover = null; handlers.onHover && handlers.onHover(null); });
    canvas.addEventListener('click', e => { const c = eventCell(e); if (c) { cursor = null; handlers.onCell(c.r, c.c); } });
    canvas.addEventListener('keydown', e => {
      const d0 = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key], d = d0 && [flip ? -d0[0] : d0[0], d0[1]];
      if (d) { e.preventDefault(); cursor = cursor ? { r: cursor.r + d[0], c: cursor.c + d[1] } : { r: 8, c: 3 }; if (!M.inBounds(cursor.r, cursor.c)) cursor = { r: Math.min(ROWS - 1, Math.max(0, cursor.r)), c: Math.min(COLS - 1, Math.max(0, cursor.c)) }; hover = cursor; handlers.onHover && handlers.onHover(hover, 0, 0, true); }
      else if ((e.key === 'Enter' || e.key === ' ') && cursor) { e.preventDefault(); handlers.onCell(cursor.r, cursor.c); }
      else if (e.key === 'Escape') handlers.onCancel && handlers.onCancel();
    });
    window.addEventListener('resize', () => { clearTimeout(init._t); init._t = setTimeout(resize, 120); });
    if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(init._t); init._t = setTimeout(resize, 80); }).observe(wrap);
    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
    requestAnimationFrame(frame);
  }

  function setView(v) {
    view = v;
    if (v && v.game) {
      if (v.game.player !== lastPlayer) {
        lastPlayer = v.game.player; flip = lastPlayer === 'german';
        meName = WF.Names.me(v.game).toUpperCase(); foeName = WF.Names.foe(v.game).toUpperCase();
        for (const sp of sprites.values()) sp.hold = false; sprites.clear();
        resize();
      }
      sync(v.game);
    }
  }
  function setZoom(z) { zoom = z; resize(); }
  function scrollTo(r, c) { if (!wrap) return; const p = centre(r, c); wrap.scrollTo({ left: p.x - wrap.clientWidth / 2, top: p.y - wrap.clientHeight / 2, behavior: 'smooth' }); }
  const isBusy = () => queue.length > 0 || fx.some(f => f.k !== 'float' && f.k !== 'dirt');
  function whenIdle(cb) { if (!isBusy()) cb(); else idleCbs.push(cb); }
  function screenPos(r, c) { const rect = canvas.getBoundingClientRect(), p = centre(r, c); return { x: rect.left + p.x * rect.width / W, y: rect.top + p.y * rect.height / H, size: S * rect.width / W }; }

  return { init, setView, enqueue, isBusy, whenIdle, setZoom, scrollTo, resize, screenPos };
})();
