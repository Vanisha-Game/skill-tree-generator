class LayoutEngine {
  constructor(config, statRegistry, seed) {
    this.config = config;
    this.statLookup = {};
    for (const s of statRegistry) this.statLookup[s.stat] = s;
    this.rng = mulberry32(seed);
    this.occupied = new Set();
    this.nodes = [];
    this.connections = [];
    this._basicCounters = {};
    this._notableCounters = {};
    this._superNotableCounters = {};
  }

  isOccupied(x, y) { return this.occupied.has(`${x},${y}`); }
  occupy(x, y) { this.occupied.add(`${x},${y}`); }

  addNode(node) {
    if (this.isOccupied(node.x, node.y)) {
      throw new Error(`Attempt to place node ${node.id} at occupied cell (${node.x},${node.y})`);
    }
    this.occupy(node.x, node.y);
    this.nodes.push(node);
  }

  addConnection(fromX, fromY, toX, toY) {
    const dist = Math.abs(fromX - toX) + Math.abs(fromY - toY);
    if (dist !== 1) {
      throw new Error(`Non-adjacent connection: (${fromX},${fromY}) -> (${toX},${toY}) dist=${dist}`);
    }
    const key = `${fromX},${fromY}-${toX},${toY}`;
    const keyRev = `${toX},${toY}-${fromX},${fromY}`;
    if (this._connectionSet.has(key) || this._connectionSet.has(keyRev)) return;
    this._connectionSet.add(key);
    this.connections.push({ from: { x: fromX, y: fromY }, to: { x: toX, y: toY } });
  }

  makeNode(id, statDef, x, y, tier) {
    const isNotable = tier === 'notable' || tier === 'super_notable';
    const isSuperNotable = tier === 'super_notable';
    return {
      id, name: statDef ? statDef.display_name : 'Start',
      description: statDef ? statDef.description : 'Beginning of the skill tree',
      levels: 1, x, y,
      isRoot: false, isNotable, isSuperNotable,
      stat: statDef ? statDef.stat : '',
      _tier: tier, _path: null, _area: null,
    };
  }

  interleaveByStatId(nodes) {
    if (nodes.length <= 1) return nodes;
    const groups = {};
    for (const n of nodes) {
      (groups[n.stat] || (groups[n.stat] = [])).push(n);
    }
    // Shuffle keys for seeded randomness, then sort largest groups first
    const keys = Object.keys(groups);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    keys.sort((a, b) => groups[b].length - groups[a].length);
    // Stride placement: each group's nodes are evenly spaced across remaining empty slots
    const result = new Array(nodes.length);
    const filled = new Array(nodes.length).fill(false);
    for (const k of keys) {
      const grp = groups[k];
      const emptySlots = [];
      for (let i = 0; i < result.length; i++) {
        if (!filled[i]) emptySlots.push(i);
      }
      for (let i = 0; i < grp.length; i++) {
        const si = Math.floor((i + 0.5) * emptySlots.length / grp.length);
        result[emptySlots[si]] = grp[i];
        filled[emptySlots[si]] = true;
      }
    }
    return result;
  }

  expandAreaStats(area, path) {
    const basics = [];
    const notables = [];
    for (const entry of area.stats) {
      const def = this.statLookup[entry.stat];
      if (!def) continue;
      const tier = def.node_tier;
      const levelsPerNode = def.levels || 1;
      const nodeCount = Math.ceil(entry.count / levelsPerNode);
      for (let i = 0; i < nodeCount; i++) {
        const desc = { stat: entry.stat, def, tier, seqIndex: i + 1, path, area: area.position };
        if (tier === 'notable' || tier === 'super_notable') notables.push(desc);
        else basics.push(desc);
      }
    }
    return { basics: this.interleaveByStatId(basics), notables: this.interleaveByStatId(notables) };
  }

  createForks(basics, notables) {
    const forks = [];
    let bi = 0;
    let ni = 0;

    while (bi < basics.length || ni < notables.length) {
      const fork = [];
      const basicsRemaining = basics.length - bi;
      const notablesRemaining = notables.length - ni;
      const hasNotable = notablesRemaining > 0;

      const maxBasics = hasNotable ? 4 : 5;
      const forksNeeded = Math.max(1, Math.ceil(basicsRemaining / 4));
      const basicsPerFork = forksNeeded > 0 ? Math.ceil(basicsRemaining / forksNeeded) : basicsRemaining;
      const basicCount = Math.min(maxBasics, basicsPerFork, basicsRemaining);

      for (let i = 0; i < basicCount; i++) fork.push(basics[bi++]);
      if (hasNotable) fork.push(notables[ni++]);

      if (fork.length > 0) forks.push(fork);
    }

    // Interleave single-node forks (standalone notables) among multi-node
    // forks as natural spacers. Consecutive branches are allowed when there
    // aren't enough spacers — the collision fallback in placeFork handles it.
    const branches = forks.filter(f => f.length > 1);
    const allSpacers = forks.filter(f => f.length === 1);

    // Pull standalone super_notables out of spacers — they belong at branch tips
    const snStandalone = allSpacers.filter(f => f[0].tier === 'super_notable');
    const spacers = allSpacers.filter(f => f[0].tier !== 'super_notable');

    if (branches.length === 0 && snStandalone.length === 0) return spacers;
    if (branches.length === 0) {
      // No branches — keep super_notables as standalone forks
      return [...spacers, ...snStandalone];
    }

    // Append super_notables to branch forks (round-robin) so they land at tips
    for (let i = 0; i < snStandalone.length; i++) {
      branches[i % branches.length].push(snStandalone[i][0]);
    }

    if (spacers.length === 0) return branches;

    const result = [];
    let si = 0;
    const spacersPerGap = spacers.length / branches.length;
    let spacerBudget = 0;
    for (const branch of branches) {
      result.push(branch);
      spacerBudget += spacersPerGap;
      while (spacerBudget >= 1 && si < spacers.length) {
        result.push(spacers[si++]);
        spacerBudget -= 1;
      }
    }
    while (si < spacers.length) result.push(spacers[si++]);
    return result;
  }

  makeNodeId(desc) {
    if (desc.tier === 'super_notable') {
      if (!this._superNotableCounters[desc.stat]) this._superNotableCounters[desc.stat] = 0;
      this._superNotableCounters[desc.stat]++;
      return `${desc.stat}_sn_${this._superNotableCounters[desc.stat]}`;
    }
    if (desc.tier === 'notable') {
      if (!this._notableCounters[desc.stat]) this._notableCounters[desc.stat] = 0;
      this._notableCounters[desc.stat]++;
      return `${desc.stat}_notable_${this._notableCounters[desc.stat]}`;
    }
    if (!this._basicCounters[desc.stat]) this._basicCounters[desc.stat] = 0;
    this._basicCounters[desc.stat]++;
    return `${desc.stat}_${this._basicCounters[desc.stat]}`;
  }

  makeNodeName(desc) {
    const romans = ['I','II','III','IV','V','VI','VII','VIII','IX','X',
                    'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
    if (desc.tier === 'super_notable' || desc.tier === 'notable') return desc.def.display_name;
    const counter = this._basicCounters[desc.stat];
    const numeral = counter <= romans.length ? romans[counter - 1] : counter.toString();
    return `${desc.def.display_name} ${numeral}`;
  }

  nextAvailableSpineDist(dir, minDist) {
    let dist = minDist;
    while (this.isOccupied(dir.dx * dist, dir.dy * dist)) dist++;
    return dist;
  }

  placeFork(fork, spineX, spineY, dir, side, pathName, areaPos) {
    const placed = [];

    const firstDesc = fork[0];
    const nodeId = this.makeNodeId(firstDesc);
    const node = this.makeNode(nodeId, firstDesc.def, spineX, spineY, firstDesc.tier);
    node.name = this.makeNodeName(firstDesc);
    node._path = pathName;
    node._area = areaPos;
    this.addNode(node);
    placed.push(node);

    if (fork.length <= 1) return placed;

    const remaining = fork.length - 1;
    // 0=straight, 1=L-shape, 2=zigzag (only non-straight with 2+ off-spine nodes)
    const shape = remaining < 2 ? 0 : Math.floor(this.rng() * 3);
    // For L-shape: how many perp steps before turning along spine
    const turnAt = shape === 1 ? 1 + Math.floor(this.rng() * Math.min(2, remaining - 1)) : 0;

    let prevX = spineX, prevY = spineY;

    for (let i = 0; i < remaining; i++) {
      const desc = fork[i + 1];
      let fx, fy;

      if (shape === 0) {
        // Straight: always perpendicular
        fx = prevX + dir.perpDx * side;
        fy = prevY + dir.perpDy * side;
      } else if (shape === 1) {
        // L-shape: perp for turnAt steps, then spine direction
        if (i < turnAt) {
          fx = prevX + dir.perpDx * side;
          fy = prevY + dir.perpDy * side;
        } else {
          fx = prevX + dir.dx;
          fy = prevY + dir.dy;
        }
      } else {
        // Zigzag: alternate perp and spine steps
        if (i % 2 === 0) {
          fx = prevX + dir.perpDx * side;
          fy = prevY + dir.perpDy * side;
        } else {
          fx = prevX + dir.dx;
          fy = prevY + dir.dy;
        }
      }

      // Collision fallback
      if (this.isOccupied(fx, fy)) {
        const triedPerp = (fx - prevX === dir.perpDx * side && fy - prevY === dir.perpDy * side);
        const altX = triedPerp ? prevX + dir.dx : prevX + dir.perpDx * side;
        const altY = triedPerp ? prevY + dir.dy : prevY + dir.perpDy * side;

        if (!this.isOccupied(altX, altY)) {
          fx = altX;
          fy = altY;
        } else {
          // Last resort: extend perpendicular from current position
          let dist = 1;
          fx = prevX + dir.perpDx * side * dist;
          fy = prevY + dir.perpDy * side * dist;
          while (this.isOccupied(fx, fy)) {
            dist++;
            fx = prevX + dir.perpDx * side * dist;
            fy = prevY + dir.perpDy * side * dist;
          }
        }
      }

      const nid = this.makeNodeId(desc);
      const n = this.makeNode(nid, desc.def, fx, fy, desc.tier);
      n.name = this.makeNodeName(desc);
      n._path = pathName;
      n._area = areaPos;
      this.addNode(n);

      this.fillAndConnect(prevX, prevY, fx, fy);

      prevX = fx;
      prevY = fy;
      placed.push(n);
    }

    return placed;
  }

  fillAndConnect(x1, y1, x2, y2) {
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);

    let cx = x1, cy = y1;
    while (cx !== x2 || cy !== y2) {
      let nx, ny;
      if (cx !== x2) { nx = cx + dx; ny = cy; }
      else { nx = cx; ny = cy + dy; }

      this.addConnection(cx, cy, nx, ny);
      cx = nx;
      cy = ny;
    }
  }

  distributePathGlobals(pathGlobal, numAreas, pathName) {
    if (!pathGlobal || pathGlobal.length === 0 || numAreas === 0) return [];
    const byArea = Array.from({ length: numAreas }, () => ({ basics: [], notables: [] }));
    let slot = 0;
    for (const entry of pathGlobal) {
      const def = this.statLookup[entry.stat];
      if (!def) continue;
      const tier = def.node_tier === 'notable' ? 'notable' : 'basic';
      const levelsPerNode = def.levels || 1;
      const nodeCount = Math.ceil(entry.count / levelsPerNode);
      for (let i = 0; i < nodeCount; i++) {
        const areaIdx = slot % numAreas;
        const desc = { stat: entry.stat, def, tier, seqIndex: i + 1, path: pathName, area: 0 };
        if (tier === 'notable') byArea[areaIdx].notables.push(desc);
        else byArea[areaIdx].basics.push(desc);
        slot++;
      }
    }
    return byArea;
  }

  applySpillover(expandedAreas, spilloverPct) {
    const numAreas = expandedAreas.length;
    if (numAreas < 2 || spilloverPct <= 0) return;

    // Record original counts BEFORE any redistribution
    const originalCounts = expandedAreas.map(a => a.basics.length + a.notables.length);

    // Phase 1: Remove spilled nodes from each area (before any additions)
    const spilledFrom = [];
    for (let ai = 0; ai < numAreas - 1; ai++) {
      const spillCount = Math.floor(originalCounts[ai] * spilloverPct / 100);
      if (spillCount === 0) { spilledFrom.push([]); continue; }

      // Protect super_notables from spillover — they're rare milestones
      const superNotables = expandedAreas[ai].notables.filter(n => n.tier === 'super_notable');
      const regularNotables = expandedAreas[ai].notables.filter(n => n.tier !== 'super_notable');

      // Shuffle pool so spilled nodes are a random sample, not biased by ordering
      const pool = [...expandedAreas[ai].basics, ...regularNotables];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const spilled = pool.splice(pool.length - spillCount, spillCount);

      expandedAreas[ai].basics = pool.filter(n => n.tier === 'basic');
      expandedAreas[ai].notables = [...pool.filter(n => n.tier === 'notable'), ...superNotables];
      spilledFrom.push(spilled);
    }

    // Phase 2: Distribute spilled nodes to later areas
    for (let ai = 0; ai < numAreas - 1; ai++) {
      const spilled = spilledFrom[ai];
      if (spilled.length === 0) continue;

      const numLater = numAreas - ai - 1;
      const perArea = Math.floor(spilled.length / numLater);
      const remainder = spilled.length - perArea * numLater;

      let spillIdx = 0;
      for (let li = ai + 1; li < numAreas; li++) {
        const count = perArea + (li - (ai + 1) < remainder ? 1 : 0);
        for (let j = 0; j < count && spillIdx < spilled.length; j++, spillIdx++) {
          const node = spilled[spillIdx];
          if (node.tier === 'notable') {
            expandedAreas[li].notables.push(node);
          } else {
            expandedAreas[li].basics.push(node);
          }
        }
      }
    }
  }

  layoutPath(pathName, pathConfig, dir, globalNodes, trueGlobalByArea, introNodes) {
    let spineDist = 1;
    let forkSide = 1;

    // Place intro area nodes (before first gate)
    if (introNodes && introNodes.length > 0) {
      const introBasics = introNodes.filter(n => n.tier !== 'notable');
      const introNotables = introNodes.filter(n => n.tier === 'notable');
      const introForks = this.createForks(this.interleaveByStatId(introBasics), this.interleaveByStatId(introNotables));
      for (const fork of introForks) {
        spineDist = this.nextAvailableSpineDist(dir, spineDist);
        const sx = dir.dx * spineDist;
        const sy = dir.dy * spineDist;
        this.placeFork(fork, sx, sy, dir, forkSide, pathName, 0);
        if (fork.length > 1) forkSide *= -1;
        spineDist++;
      }
    }

    // Fallback: if path has cross-path globals but no areas, place them on spine
    if (globalNodes && globalNodes.length > 0 && pathConfig.areas.length === 0) {
      const globalForks = this.createForks(globalNodes, []);
      for (const fork of globalForks) {
        spineDist = this.nextAvailableSpineDist(dir, spineDist);
        const sx = dir.dx * spineDist;
        const sy = dir.dy * spineDist;
        this.placeFork(fork, sx, sy, dir, forkSide, pathName, 0);
        if (fork.length > 1) forkSide *= -1;
        spineDist++;
      }
    }

    // If path has globals but no areas, place them on the spine as fallback
    if (pathConfig.global && pathConfig.global.length > 0 && pathConfig.areas.length === 0) {
      const fallbackNodes = [];
      for (const entry of pathConfig.global) {
        const def = this.statLookup[entry.stat];
        if (!def) continue;
        const levelsPerNode = def.levels || 1;
        const nodeCount = Math.ceil(entry.count / levelsPerNode);
        for (let i = 0; i < nodeCount; i++) {
          fallbackNodes.push({
            stat: entry.stat, def,
            tier: def.node_tier === 'notable' ? 'notable' : 'basic',
            seqIndex: i + 1, path: pathName, area: 0
          });
        }
      }
      const fallbackBasics = fallbackNodes.filter(n => n.tier !== 'notable');
      const fallbackNotables = fallbackNodes.filter(n => n.tier === 'notable');
      const fallbackForks = this.createForks(fallbackBasics, fallbackNotables);
      for (const fork of fallbackForks) {
        spineDist = this.nextAvailableSpineDist(dir, spineDist);
        const sx = dir.dx * spineDist;
        const sy = dir.dy * spineDist;
        this.placeFork(fork, sx, sy, dir, forkSide, pathName, 0);
        if (fork.length > 1) forkSide *= -1;
        spineDist++;
      }
    }

    const pathGlobalByArea = this.distributePathGlobals(
      pathConfig.global, pathConfig.areas.length, pathName
    );

    // Pre-expand all areas before placement
    const expandedAreas = [];
    for (let ai = 0; ai < pathConfig.areas.length; ai++) {
      const area = pathConfig.areas[ai];
      const { basics, notables } = this.expandAreaStats(area, pathName);

      const extra = pathGlobalByArea[ai];
      if (extra) {
        basics.push(...extra.basics);
        notables.push(...extra.notables);
      }
      const trueExtra = trueGlobalByArea[ai];
      if (trueExtra) {
        basics.push(...trueExtra.basics);
        notables.push(...trueExtra.notables);
      }

      expandedAreas.push({ basics, notables });
    }

    // Apply spillover redistribution
    const spilloverPct = this.config.spilloverPercent || 0;
    this.applySpillover(expandedAreas, spilloverPct);

    // Place gates and forks for each area
    for (let ai = 0; ai < pathConfig.areas.length; ai++) {
      const area = pathConfig.areas[ai];

      if (area.gate) {
        const gateDef = this.statLookup[area.gate];
        if (gateDef) {
          spineDist = this.nextAvailableSpineDist(dir, spineDist);
          const gx = dir.dx * spineDist;
          const gy = dir.dy * spineDist;
          const gateNode = this.makeNode(area.gate, gateDef, gx, gy, 'super_notable');
          gateNode._path = pathName;
          gateNode._area = area.position;
          gateNode._isGate = true;
          this.addNode(gateNode);
          forkSide *= -1;
          spineDist++;
        }
      }

      const { basics, notables } = expandedAreas[ai];
      const forks = this.createForks(basics, notables);

      for (const fork of forks) {
        spineDist = this.nextAvailableSpineDist(dir, spineDist);
        const sx = dir.dx * spineDist;
        const sy = dir.dy * spineDist;
        this.placeFork(fork, sx, sy, dir, forkSide, pathName, area.position);
        if (fork.length > 1) forkSide *= -1;
        spineDist++;
      }
    }
  }

  buildSpineConnections(pathName, dir) {
    const spineNodes = this.nodes.filter(n => {
      if (n._path !== pathName) return false;
      if (dir.dx !== 0) return n.y === 0 && Math.sign(n.x) === dir.dx;
      return n.x === 0 && Math.sign(n.y) === dir.dy;
    });

    if (spineNodes.length === 0) return;

    spineNodes.sort((a, b) => {
      const distA = Math.abs(a.x) + Math.abs(a.y);
      const distB = Math.abs(b.x) + Math.abs(b.y);
      return distA - distB;
    });

    // Connect root to first spine node, then each consecutive pair
    let prevX = 0, prevY = 0;
    for (const n of spineNodes) {
      this.addConnection(prevX, prevY, n.x, n.y);
      prevX = n.x;
      prevY = n.y;
    }
  }

  generate() {
    this._basicCounters = {};
    this._notableCounters = {};
    this._superNotableCounters = {};
    this._connectionSet = new Set();
    this._pathSpinePositions = {};
    this.nodes = [];
    this.connections = [];
    this.occupied = new Set();

    const root = {
      id: 'root', name: 'Start', description: 'Beginning of the skill tree',
      levels: 1, x: 0, y: 0,
      isRoot: true, isNotable: false, isSuperNotable: false,
      stat: '', _tier: 'root', _path: null, _area: null,
    };
    this.addNode(root);

    const globalByPath = { north: [], south: [], east: [], west: [] };
    const pathNames = ['north', 'south', 'east', 'west'];
    if (this.config.global) {
      let pi = 0;
      for (const entry of this.config.global) {
        const def = this.statLookup[entry.stat];
        if (!def) continue;
        const levelsPerNode = def.levels || 1;
        const nodeCount = Math.ceil(entry.count / levelsPerNode);
        for (let i = 0; i < nodeCount; i++) {
          const pn = pathNames[pi % 4];
          globalByPath[pn].push({
            stat: entry.stat, def,
            tier: def.node_tier === 'notable' ? 'notable' : 'basic',
            seqIndex: i + 1, path: pn, area: 0
          });
          pi++;
        }
      }
    }

    for (const pn of pathNames) {
      const originalPathConfig = this.config.paths[pn];
      if (!originalPathConfig) continue;
      const pathConfig = { ...originalPathConfig, global: [...(originalPathConfig.global || [])] };

      const introCount = this.config.introNodesPerPath || 0;
      let introNodes = [];

      if (introCount > 0) {
        // Calculate 70/30 split: 70% path-global, 30% cross-path global
        const pathGlobalShare = Math.round(introCount * 0.7);
        const globalShare = introCount - pathGlobalShare;

        // Expand path-global into node descriptors
        const pathGlobalExpanded = [];
        if (pathConfig.global) {
          for (const entry of pathConfig.global) {
            const def = this.statLookup[entry.stat];
            if (!def) continue;
            const levelsPerNode = def.levels || 1;
            const nodeCount = Math.ceil(entry.count / levelsPerNode);
            for (let i = 0; i < nodeCount; i++) {
              pathGlobalExpanded.push({
                stat: entry.stat, def,
                tier: def.node_tier === 'notable' ? 'notable' : 'basic',
                seqIndex: i + 1, path: pn, area: 0
              });
            }
          }
        }

        // Shuffle pools so intro selection isn't biased by config entry order
        for (let i = pathGlobalExpanded.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [pathGlobalExpanded[i], pathGlobalExpanded[j]] = [pathGlobalExpanded[j], pathGlobalExpanded[i]];
        }
        for (let i = globalByPath[pn].length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [globalByPath[pn][i], globalByPath[pn][j]] = [globalByPath[pn][j], globalByPath[pn][i]];
        }

        // Claim from path-global first, then overflow to global
        const fromPathGlobal = pathGlobalExpanded.splice(0, pathGlobalShare);
        let remaining = pathGlobalShare - fromPathGlobal.length;

        // Claim from cross-path global, plus any overflow
        const fromGlobal = globalByPath[pn].splice(0, globalShare + remaining);
        remaining = (globalShare + remaining) - fromGlobal.length;

        // If global didn't have enough, take more from path-global
        if (remaining > 0) {
          fromPathGlobal.push(...pathGlobalExpanded.splice(0, remaining));
        }

        introNodes = [...fromPathGlobal, ...fromGlobal];

        // Rebuild pathConfig.global to reflect what was taken
        // Convert remaining expanded nodes back to entry format
        const rebuiltGlobal = [];
        const rebuiltSeen = {};
        for (const n of pathGlobalExpanded) {
          if (!rebuiltSeen[n.stat]) { rebuiltSeen[n.stat] = { stat: n.stat, count: 0 }; rebuiltGlobal.push(rebuiltSeen[n.stat]); }
          rebuiltSeen[n.stat].count += (n.def.levels || 1);
        }
        pathConfig.global = rebuiltGlobal;
      }

      // Convert remaining globalByPath to entry format for distributePathGlobals
      const globalEntries = [];
      const seen = {};
      for (const g of globalByPath[pn]) {
        if (!seen[g.stat]) { seen[g.stat] = { stat: g.stat, count: 0 }; globalEntries.push(seen[g.stat]); }
        seen[g.stat].count += (g.def.levels || 1);
      }
      const numAreas = (pathConfig.areas || []).length;
      const trueGlobalByArea = numAreas > 0
        ? this.distributePathGlobals(globalEntries, numAreas, pn)
        : [];
      this.layoutPath(pn, pathConfig, DIRECTIONS[pn], globalByPath[pn], trueGlobalByArea, introNodes);
    }

    for (const pn of pathNames) {
      if (!this.config.paths[pn]) continue;
      this.buildSpineConnections(pn, DIRECTIONS[pn]);
    }

    return { nodes: this.nodes, connections: this.connections };
  }
}
