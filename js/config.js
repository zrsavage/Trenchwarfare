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
    storm:     { name: 'Stormtroopers', move: 3, startStrength: 4, year: 1918,
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
      { t: 'infantry', r: 4,  c: 10, s: 6 }, { t: 'infantry', r: 11, c: 10, s: 6 },  // hub guards
    ],
  },

  // ---- Combat ----
  combat: {
    atkMod: { infantry: 1, machinegun: 0.4, artillery: 0, gas: 0, tank: 1.8, storm: 1.3 },
    defMod: { infantry: 1, machinegun: 0.6, artillery: 0.5, gas: 0.4, tank: 1.2, storm: 1 },
    trenchReduction: [0, 0.4, 0.6, 0.8],      // damage reduction by trench level
    trenchDefBonus: [0, 0.3, 0.6, 0.9],       // extra defence power by trench level
    wireDefBonus: 0.3,
    adjacentMgBonus: 0.5,                     // defender has a friendly machine gun next to it
    attackDamage: 0.5,                        // damage to defender per point of attack power
    counterDamage: 0.6,                       // damage to attacker per point of defence power
    tankProtection: 0.25,                     // damage cut for infantry next to a working tank
    tankMgImmunity: 0.8,                      // fraction of machine-gun damage a tank shrugs off
    antiTankMod: 1.5,                         // German defence vs tanks once they adapt
    creepingFrom: 1917,
    capturers: ['infantry', 'storm', 'tank'], // units that advance into a square they clear
  },
  machineGun: { damagePerStrength: 0.75 },
  bombard: {
    short: { damage: 3, craterChance: 0.25, wireClear: 1 },
    long:  { damage: 7, adjacentDamage: 3, unlockYear: 1916 },
  },
  gas: { firstUse: 6, later: 3, masked: 1, areaRows: 1, unlockYear: 1915 },
  tank: { breakdown: 0.3, breakdownCountered: 0.4 },
  rail: { squaresPerTurn: 6 },
  counters: { gasMasksFrom: 1917, antiTankFrom: 1918 },
  recruitCost: { infantry: 6, machinegun: 4, artillery: 5, gas: 3, tank: 4, storm: 4 },

  // ---- Computer opponent ----
  ai: {
    reserveCap: 2,               // rail reserves sent to a lost trench per turn
    minReserveCap: 1,            // even an exhausted army can send this many
    exhaustFloor: 3,             // exhaustion never shrinks a reserve below this strength
    maxExtendPerTurn: 2,         // flank-matching reserves sent per turn
    artilleryChance: 0.7,
    attackRatio: 1.0,            // attacks an adjacent unit in the open if damage dealt >= ratio x taken
    baselineDigTurn: 3,          // game turn (1914) after which the front digs in on its own
    trenchGoalByYear: { 1914: 1, 1915: 2, 1916: 3, 1917: 3, 1918: 3 },
    hubReserveAttacksSameTurn: true,
    offensiveYear: 1918,
    offensiveTurns: [2, 3],      // spring offensive
  },

  // ---- Home front ----
  startMorale: 100,
  morale: { perStrength: 0.55, failedOffensiveLoss: 3, failedOffensiveExtra: 3, yearHit: { 1917: 5 } },
  manpowerByYear: { 1914: 6, 1915: 12, 1916: 24, 1917: 12, 1918: 20 },
  americans: { year: 1918, count: 2, strength: 8 },
  alliedFront: 3,                // columns <= this start Allied-owned

  saveKey: 'westernfront-save-v3',
};
