// Tiny synthesized sound effects (no audio files). Off by default; the player turns it on.
globalThis.WF = globalThis.WF || {};

WF.Audio = (function () {
  let ctx = null, master = null, muted = true;
  try { muted = localStorage.getItem('wf-sound') !== 'on'; } catch (e) { /* ignore */ }

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise(dur, f0, f1, vol, type) {
    const c = ensure(); if (!c || muted) return;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.setValueAtTime(f0, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }

  function tone(freq, dur, type, vol, to) {
    const c = ensure(); if (!c || muted) return;
    const o = c.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (to) o.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(c.currentTime + dur);
  }

  const SOUNDS = {
    click: () => tone(520, 0.06, 'square', 0.05),
    boom: () => { noise(0.9, 900, 60, 0.9); tone(70, 0.5, 'sine', 0.6, 30); },
    boomSmall: () => { noise(0.5, 1200, 90, 0.6); tone(90, 0.3, 'sine', 0.4, 40); },
    mg: () => { for (let i = 0; i < 5; i++) setTimeout(() => noise(0.05, 3500, 1500, 0.25, 'bandpass'), i * 55); },
    clash: () => { noise(0.18, 2500, 400, 0.45, 'bandpass'); tone(160, 0.15, 'triangle', 0.25, 80); },
    dig: () => { noise(0.25, 700, 200, 0.35); },
    gas: () => noise(0.9, 4000, 1500, 0.3, 'highpass'),
    heal: () => tone(660, 0.12, 'sine', 0.08, 880),
    horn: () => { tone(220, 0.5, 'sawtooth', 0.08); tone(277, 0.5, 'sawtooth', 0.06); },
  };

  function play(name) { if (!muted && SOUNDS[name]) { try { SOUNDS[name](); } catch (e) { /* ignore */ } } }
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('wf-sound', m ? 'off' : 'on'); } catch (e) { /* ignore */ }
    if (!m) { ensure(); play('click'); }
  }
  return { play, setMuted, isMuted: () => muted };
})();
