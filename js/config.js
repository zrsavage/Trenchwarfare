// All tunable numbers live here so the game can be balanced without touching logic.
globalThis.WF = globalThis.WF || {};

WF.CONFIG = {
  // ---- Map ----
  rows: 16,                 // north (Channel) to south (Switzerland)
  cols: 12,                 // west (Allied rear) to east (German rear)
  alliedRearCols: [0, 1, 2],
  germanRearCols: [9, 10, 11],
  railCol: 10,              // rail line runs the full length of this column
  hubs: [{ r: 3, c: 10 }, { r: 12, c: 10 }],   // breakthrough objectives

  // Terrain that exists before the first turn (1914 starts empty).
  // Entries: { r, c, wire: true } | { r, c, crater: true } | { r, c, trench: 1-3 }
  startingTerrain: [],

  // ---- Time ----
  startYear: 1914,
  endYear: 1918,
  turnsPerYear: 6,

  // ---- Movement ----
  movement: {
    craterCost: 2,          // movement points to enter a crater / mud square
    openCost: 1,
    trenchCost: 1,
    overTheTopLimit: 1,     // leaving a trench toward the enemy: stop after this many squares
    wireEndsMove: true,     // entering wire uses up the unit's whole move
  },

  // ---- Ranges (Manhattan distance, in sectors) ----
  ranges: { machineGun: 2, artillery: 4, gas: 3 },

  // ---- Units ----
  maxStrength: 10,          // 1 point = 1,000 men
  menPerStrength: 1000,
  units: {
    infantry:  { name: 'Infantry',      move: 2, startStrength: 6, year: 1914,
      role: 'Moves, attacks, digs and captures squares.' },
    machinegun:{ name: 'Machine Gun',   move: 1, startStrength: 4, year: 1914,
      role: 'Devastating fire on open squares within 2. Weak in close attack.' },
    artillery: { name: 'Artillery',     move: 1, startStrength: 5, year: 1914,
      role: 'Bombards squares within 4. Never captures ground. Creates craters.' },
    gas:       { name: 'Gas Company',   move: 1, startStrength: 3, year: 1915,
      role: 'One-time gas attack on a 3-square area.' },
    tank:      { name: 'Tank',          move: 1, startStrength: 4, year: 1917,
      role: 'Crosses wire and trenches, protects adjacent infantry. May break down.' },
    storm:     { name: 'Stormtroopers', move: 3, startStrength: 5, year: 1918,
      role: 'Infiltration: can move past an enemy square instead of stopping.' },
  },

  // ---- Starting forces (1914). r = row, c = column, s = strength ----
  startingForces: {
    allied: [
      { t: 'infantry', r: 2,  c: 3, s: 6 }, { t: 'infantry', r: 5,  c: 3, s: 6 },
      { t: 'infantry', r: 8,  c: 3, s: 6 }, { t: 'infantry', r: 11, c: 3, s: 6 },
      { t: 'infantry', r: 14, c: 3, s: 6 },
      { t: 'machinegun', r: 5,  c: 2 },     { t: 'machinegun', r: 11, c: 2 },
      { t: 'artillery',  r: 7,  c: 1 },     { t: 'artillery',  r: 9,  c: 1 },
    ],
    german: [
      { t: 'infantry', r: 2,  c: 8, s: 6 }, { t: 'infantry', r: 5,  c: 8, s: 6 },
      { t: 'infantry', r: 8,  c: 8, s: 6 }, { t: 'infantry', r: 11, c: 8, s: 6 },
      { t: 'infantry', r: 14, c: 8, s: 6 },
      { t: 'machinegun', r: 4,  c: 8 },     { t: 'machinegun', r: 12, c: 8 },
      { t: 'artillery',  r: 7,  c: 9 },     { t: 'artillery',  r: 9,  c: 9 },
      { t: 'infantry', r: 6,  c: 10, s: 6 }, { t: 'infantry', r: 10, c: 10, s: 6 },  // rail reserves
    ],
  },

  // ---- Home front (displayed now, driven in a later phase) ----
  startMorale: 100,
  manpowerByYear: { 1914: 10, 1915: 12, 1916: 20, 1917: 12, 1918: 14 },

  saveKey: 'westernfront-save-v1',
};
