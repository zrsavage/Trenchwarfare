// Headless bot simulation for balance checks. Usage: node tests/sim.js [runs]
const fs = require('fs'), vm = require('vm');
for (const f of ['config','map','units','years','combat','ai','main']) vm.runInThisContext(fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8'));
WF.UI = { init(){}, render(){}, showOverlay(){}, showEnd(s){ WF._end = s; } };
globalThis.localStorage = { setItem(){}, getItem(){ return null; }, removeItem(){} };
const { CONFIG: C, Map: M, Units: U, Combat: K } = WF;
let seed = 1; WF.rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function run(strategy, s) {
  seed = s; WF._end = null;
  const g = WF.Game.newGame(); WF.Game._set(g);
  g.log.push({ text: 'start' });
  let guard = 0, end = null;
  while (!g.over && guard++ < 100) {
    strategy(g);
    WF.Game.endTurn();
    if (g.over) break;
  }
  return { type: WF._end && WF._end.type, g, end: WF._end };
}
const mine = g => g.units.filter(u => u.side === 'allied');
const enemies = g => g.units.filter(u => u.side === 'german');

// Never dig: march infantry straight at the enemy in the open.
function marcher(g) {
  for (const u of mine(g)) {
    if (u.type !== 'infantry' || u.acted) continue;
    const adj = K.attackTargets(g, u);
    if (adj.length) { K.attack(g, u, adj[0]); continue; }
    const tgt = enemies(g).sort((a, b) => M.distance(u.r,u.c,a.r,a.c) - M.distance(u.r,u.c,b.r,b.c))[0];
    if (tgt) WF.AI.moveToward(g, u, tgt.r, tgt.c);
  }
}
// Dig everywhere, never attack.
function digger(g) {
  for (const u of mine(g)) if (!u.acted && K.canDig(g, u)) K.dig(g, u);
  g.manpower = g.manpower; 
}
// 1918 combined arms: recruit, bombard, tanks + storm to the hub.
function combined(g) {
  // buy stormtroopers/tanks when available
  const rows = [3, 12];
  while (g.manpower >= C.recruitCost.storm && g.year >= 1918) {
    let placed = false;
    for (let r = 0; r < C.rows && !placed; r++) for (const c of C.alliedRearCols) if (!U.at(g, r, c)) { U.create(g, 'storm', 'allied', r, c); g.manpower -= C.recruitCost.storm; placed = true; break; }
    if (!placed) break;
  }
  while (g.manpower >= C.recruitCost.tank && g.year >= 1917) {
    let placed = false;
    for (let r = 0; r < C.rows && !placed; r++) for (const c of C.alliedRearCols) if (!U.at(g, r, c)) { U.create(g, 'tank', 'allied', r, c); g.manpower -= C.recruitCost.tank; placed = true; break; }
    if (!placed) break;
  }
  for (const u of mine(g)) {
    if (u.acted) continue;
    if (u.type === 'artillery') {
      const t = enemies(g).find(e => K.inRange(u, e.r, e.c, 4));
      if (t) K.bombard(g, u, t.r, t.c, g.year >= 1916 ? 'long' : 'short');
      continue;
    }
    if (u.type === 'tank' || u.type === 'storm' || u.type === 'infantry') {
      if (g.year < 1918 && u.type !== 'tank') { if (K.canDig(g, u)) K.dig(g, u); continue; }
      const adj = K.attackTargets(g, u);
      if (adj.length && u.type !== 'storm') { K.attack(g, u, adj[0]); continue; }
      const hub = C.hubs[0];
      const tgt = u.type === 'storm' ? C.hubs.sort((a,b)=>M.distance(u.r,u.c,a.r,a.c)-M.distance(u.r,u.c,b.r,b.c))[0] : enemies(g)[0];
      if (tgt) WF.AI.moveToward(g, u, tgt.r, tgt.c);
    } else if (K.canDig(g, u)) K.dig(g, u);
  }
}

const N = +process.argv[2] || 30;
for (const [name, strat] of [['marcher', marcher], ['digger', digger], ['combined', combined]]) {
  const res = {}; let cas = 0, gain = 0, over1914 = 0, n = 0;
  for (let i = 1; i <= N; i++) {
    const r = run(strat, i * 7919);
    res[r.type] = (res[r.type] || 0) + 1; cas += r.g.casualties; gain += WF.Years.gainedSquares(r.g);
    n++;
  }
  console.log(name.padEnd(9), JSON.stringify(res), 'avg casualties', (cas / n).toFixed(1), 'avg gained', (gain / n).toFixed(1));
}
if (process.argv[3] === 'detail') {
  const yrs = {};
  for (let i = 1; i <= N; i++) { const r = run(combined, i * 7919); if (r.type === 'breakthrough') { const k = r.g.year + 't' + r.g.turn; yrs[k] = (yrs[k] || 0) + 1; } }
  console.log(yrs);
}
