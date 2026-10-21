// Grid, terrain and trench levels.
globalThis.WF = globalThis.WF || {};

WF.Map = (function () {
  const C = WF.CONFIG;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function newCell(r, c) {
    return {
      trench: 0,                          // 0-3, permanent once dug
      wire: false,
      crater: false,                      // craters / mud, permanent
      rail: c === C.railCol,
      hub: C.hubs.some(h => h.r === r && h.c === c),
    };
  }

  function create() {
    const cells = [];
    for (let r = 0; r < C.rows; r++) {
      const row = [];
      for (let c = 0; c < C.cols; c++) row.push(newCell(r, c));
      cells.push(row);
    }
    for (const t of C.startingTerrain) {
      const cell = cells[t.r][t.c];
      if (t.wire) cell.wire = true;
      if (t.crater) cell.crater = true;
      if (t.trench) cell.trench = t.trench;
    }
    return cells;
  }

  const inBounds = (r, c) => r >= 0 && r < C.rows && c >= 0 && c < C.cols;
  const label = (r, c) => LETTERS[c] + (r + 1);          // e.g. "F7"
  const distance = (r1, c1, r2, c2) => Math.abs(r1 - r2) + Math.abs(c1 - c2);

  // Orthogonal neighbours only. The north and south edges are impassable,
  // which is what ends the Race to the Sea.
  function neighbors(r, c) {
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(p => inBounds(p[0], p[1]));
  }

  function zone(c) {
    if (C.alliedRearCols.includes(c)) return 'allied-rear';
    if (C.germanRearCols.includes(c)) return 'german-rear';
    return 'contested';
  }

  function describe(cell) {
    const parts = [];
    if (cell.trench) parts.push('trench level ' + cell.trench);
    if (cell.wire) parts.push('barbed wire');
    if (cell.crater) parts.push('craters and mud');
    if (cell.hub) parts.push('rail hub (objective)');
    else if (cell.rail) parts.push('German rail line');
    return parts.length ? parts.join(', ') : 'open ground';
  }

  return { create, inBounds, label, distance, neighbors, zone, describe };
})();
