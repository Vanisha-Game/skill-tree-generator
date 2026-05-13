function validateLayout(result) {
  const log = [];
  let allPass = true;

  const coordSet = new Set();
  let dupes = 0;
  for (const n of result.nodes) {
    const key = `${n.x},${n.y}`;
    if (coordSet.has(key)) {
      dupes++;
      log.push({ text: `  DUPE: ${n.id} at (${n.x},${n.y})`, cls: 'fail' });
    }
    coordSet.add(key);
  }
  if (dupes > 0) {
    allPass = false;
    log.push({ text: `[FAIL] ${dupes} duplicate coordinate(s)`, cls: 'fail' });
  } else {
    log.push({ text: `[PASS] No duplicate coordinates (${result.nodes.length} nodes)`, cls: 'pass' });
  }

  let badConns = 0;
  for (const c of result.connections) {
    const dist = Math.abs(c.from.x - c.to.x) + Math.abs(c.from.y - c.to.y);
    if (dist !== 1) {
      badConns++;
      log.push({ text: `  BAD CONN: (${c.from.x},${c.from.y}) -> (${c.to.x},${c.to.y}) dist=${dist}`, cls: 'fail' });
    }
  }
  if (badConns > 0) {
    allPass = false;
    log.push({ text: `[FAIL] ${badConns} non-adjacent connection(s)`, cls: 'fail' });
  } else {
    log.push({ text: `[PASS] All ${result.connections.length} connections are adjacent (Manhattan dist = 1)`, cls: 'pass' });
  }

  const adj = {};
  for (const n of result.nodes) adj[`${n.x},${n.y}`] = [];
  for (const c of result.connections) {
    const fk = `${c.from.x},${c.from.y}`, tk = `${c.to.x},${c.to.y}`;
    if (adj[fk]) adj[fk].push(tk);
    if (adj[tk]) adj[tk].push(fk);
  }
  const visited = new Set();
  const queue = ['0,0'];
  visited.add('0,0');
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nb of (adj[cur] || [])) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  const unreachable = result.nodes.filter(n => !visited.has(`${n.x},${n.y}`));
  if (unreachable.length > 0) {
    allPass = false;
    log.push({ text: `[FAIL] ${unreachable.length} unreachable node(s):`, cls: 'fail' });
    for (const n of unreachable.slice(0, 15)) {
      log.push({ text: `  - ${n.id} at (${n.x},${n.y}) path=${n._path}`, cls: 'fail' });
    }
    if (unreachable.length > 15) log.push({ text: `  ... and ${unreachable.length - 15} more`, cls: 'fail' });
  } else {
    log.push({ text: `[PASS] All nodes reachable from root (BFS traversal)`, cls: 'pass' });
  }

  const gates = result.nodes.filter(n => n.isSuperNotable && n._isGate);
  let offSpine = 0;
  for (const g of gates) {
    const dir = DIRECTIONS[g._path];
    const onSpine = dir ? (dir.dx === 0 ? g.x === 0 : g.y === 0) : (g.x === 0 || g.y === 0);
    if (!onSpine) {
      offSpine++;
      log.push({ text: `  OFF-SPINE GATE: ${g.id} at (${g.x},${g.y}) path=${g._path}`, cls: 'fail' });
    }
  }
  if (offSpine > 0) {
    allPass = false;
    log.push({ text: `[FAIL] ${offSpine} gate node(s) off-spine`, cls: 'fail' });
  } else {
    log.push({ text: `[PASS] All ${gates.length} gate node(s) on spine`, cls: 'pass' });
  }

  const connectedCoords = new Set();
  for (const c of result.connections) {
    connectedCoords.add(`${c.from.x},${c.from.y}`);
    connectedCoords.add(`${c.to.x},${c.to.y}`);
  }
  const orphans = result.nodes.filter(n => !n.isRoot && !connectedCoords.has(`${n.x},${n.y}`));
  if (orphans.length > 0) {
    allPass = false;
    log.push({ text: `[FAIL] ${orphans.length} orphaned node(s):`, cls: 'fail' });
    for (const o of orphans.slice(0, 10)) {
      log.push({ text: `  - ${o.id} at (${o.x},${o.y})`, cls: 'fail' });
    }
  } else {
    log.push({ text: `[PASS] No orphaned nodes`, cls: 'pass' });
  }

  const statNodes = result.nodes.filter(n => !n.isRoot);
  const bounds = result.nodes.reduce((b, n) => ({
    minX: Math.min(b.minX, n.x), maxX: Math.max(b.maxX, n.x),
    minY: Math.min(b.minY, n.y), maxY: Math.max(b.maxY, n.y),
  }), { minX: 0, maxX: 0, minY: 0, maxY: 0 });

  log.push({ text: '', cls: 'info' });
  log.push({ text: `SUMMARY:`, cls: 'info' });
  log.push({ text: `  Total nodes: ${result.nodes.length} (1 root + ${statNodes.length} stat)`, cls: 'info' });
  log.push({ text: `  Total connections: ${result.connections.length}`, cls: 'info' });
  log.push({ text: `  Grid bounds: X[${bounds.minX}, ${bounds.maxX}] Y[${bounds.minY}, ${bounds.maxY}]`, cls: 'info' });
  log.push({ text: `  Gate nodes: ${gates.length}`, cls: 'info' });

  for (const pn of ['north', 'south', 'east', 'west']) {
    const pathNodes = result.nodes.filter(n => n._path === pn);
    log.push({ text: `  ${pn}: ${pathNodes.length} stat nodes`, cls: 'info' });
  }

  log.push({ text: `  Overall: ${allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`, cls: allPass ? 'pass' : 'fail' });

  return { pass: allPass, log };
}
