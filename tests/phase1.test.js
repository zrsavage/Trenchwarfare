// Run with: node tests/phase1.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
for (const f of ['config', 'map', 'units']) vm.runInThisContext(fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8'));
const { CONFIG: C, Map: M, Units: U } = WF;

function fresh() {
  const g = { nextId: 1, map: M.create(), units: [] };
  return g;
}
const keys = m => [...m.keys()].sort();

// Map shape
let g = fresh();
assert.equal(g.map.length, 16); assert.equal(g.map[0].length, 12);
assert.ok(g.map.every(row => row[10].rail), 'rail on column 11');
assert.equal(g.map.flat().filter(c => c.hub).length, 2, 'two hubs');
assert.equal(M.label(5, 5), 'F6');

// Infantry in the open: 2 squares, orthogonal, edges respected
g = fresh();
let inf = U.create(g, 'infantry', 'allied', 0, 5);
let reach = U.reachable(g, inf);
assert.ok(reach.has('1,5') && reach.has('2,5') && reach.has('0,6') && reach.has('1,6'));
assert.ok(!reach.has('-1,5') && !reach.has('3,5') && !reach.has('0,5'));

// Enemies block, friends can be passed but not occupied
U.create(g, 'infantry', 'german', 1, 5);
U.create(g, 'machinegun', 'allied', 0, 6);
reach = U.reachable(g, inf);
assert.ok(!reach.has('1,5') && !reach.has('2,5'), 'cannot pass enemy in a column');
assert.ok(!reach.has('0,6') && reach.has('0,7'), 'pass through friend, not stop');

// Crater costs 2 (only as first step); wire ends the move
g = fresh(); inf = U.create(g, 'infantry', 'allied', 5, 5);
g.map[5][6].crater = true; g.map[5][4].wire = true; g.map[6][5].crater = true;
reach = U.reachable(g, inf);
assert.equal(reach.get('5,6').cost, 2);
assert.ok(!reach.has('5,7'), 'crater uses full move');
assert.equal(reach.get('5,4').cost, 2);
assert.ok(!reach.has('5,3'), 'wire ends the move');
g.map[4][5].crater = true; g.map[3][5].crater = false;
g.map[4][5].crater = false; g.map[3][5].crater = true;
reach = U.reachable(g, inf);
assert.ok(!reach.has('3,5'), 'crater as second step unaffordable');

// Over the top: leaving a trench toward the enemy -> 1 square only; sideways is free
g = fresh(); inf = U.create(g, 'infantry', 'allied', 5, 5);
g.map[5][5].trench = 2;
reach = U.reachable(g, inf);
assert.ok(reach.has('5,6') && !reach.has('5,7'), 'over the top: one square');
assert.ok(reach.has('3,5') && reach.has('5,4') && reach.has('5,3'), 'sideways/back unrestricted');
g.map[5][6].trench = 1;
assert.ok(U.reachable(g, inf).has('5,7'), 'trench to trench is not over the top');
// German direction mirrored
const ger = U.create(g, 'infantry', 'german', 8, 8); g.map[8][8].trench = 1;
reach = U.reachable(g, ger);
assert.ok(reach.has('8,7') && !reach.has('8,6') && reach.has('8,9') && reach.has('8,10'));

// Killzone: open squares within 2 of enemy MGs only
g = fresh(); U.create(g, 'machinegun', 'german', 8, 8); g.map[8][7].trench = 1;
let kz = U.killZone(g, 'allied');
assert.ok(kz.has('8,6') && kz.has('7,7') && !kz.has('8,7') && !kz.has('8,5') && !kz.has('8,8'));
assert.equal(U.killZone(g, 'german').size, 0);

// Starting forces fit the map and don't overlap
g = fresh(); U.placeStartingForces(g);
const seen = new Set();
for (const u of g.units) { const k = u.r + ',' + u.c; assert.ok(!seen.has(k), 'overlap ' + k); seen.add(k); assert.ok(M.inBounds(u.r, u.c)); }
console.log('phase 1 tests passed (' + g.units.length + ' starting units)');
