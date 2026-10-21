// Run with: node tests/ai.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
for (const f of ['config','map','units','years','combat','ai','main']) vm.runInThisContext(fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8'));
WF.UI = { init(){}, render(){}, showOverlay(){}, showEnd(){} };
globalThis.localStorage = { setItem(){}, getItem(){ return null; }, removeItem(){} };
let seed = 5; WF.rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const { Units: U, Combat: K, AI } = WF;

// Flanking is matched: a unit sent to the far north gets a German trench facing it within 3 turns.
let g = WF.Game.newGame(); WF.Game._set(g); g.log.push({ text: 'x' });
const flanker = U.create(g, 'infantry', 'allied', 0, 4, 6);
for (let t = 0; t < 3; t++) { AI.takeTurn(g); K.mgFire(g, 'german'); }
const faced = g.units.some(u => u.side === 'german' && u.r <= 1 && u.c >= 4 && g.map[u.r][u.c].trench > 0);
assert.ok(faced, 'German trench opposite the flanker within 3 turns');

// Mirror digging: a player trench in row 8 gets a German trench in row 8.
g = WF.Game.newGame(); WF.Game._set(g); g.log.push({ text: 'x' });
const u = g.units.find(x => x.side === 'allied' && x.r === 8 && x.type === 'infantry');
K.dig(g, u);
AI.takeTurn(g);
assert.ok(g.units.some(x => x.side === 'german' && x.r === 8 && g.map[x.r][x.c].trench > 0), 'mirror dig');

// Trench damage reduction and over-the-top
g = WF.Game.newGame(); WF.Game._set(g);
const a = U.create(g, 'infantry', 'allied', 5, 5, 6), d = U.create(g, 'infantry', 'german', 5, 6, 6);
const open = K.estimate(g, a, d).toDef; g.map[5][6].trench = 3;
assert.ok(K.estimate(g, a, d).toDef < open * 0.25, '80% reduction at level 3');

// Machine guns hit only open squares
g = WF.Game.newGame(); WF.Game._set(g);
g.units = [];
const mg = U.create(g, 'machinegun', 'german', 8, 8, 4), t1 = U.create(g, 'infantry', 'allied', 8, 6, 6), t2 = U.create(g, 'infantry', 'allied', 9, 7, 6);
g.map[9][7].trench = 1;
K.mgFire(g, 'german');
assert.ok(t1.strength < 6 && t2.strength === 6, 'MG hits open square only');
console.log('ai/combat tests passed');
