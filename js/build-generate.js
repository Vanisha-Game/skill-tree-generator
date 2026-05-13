function runPreGenerationWarnings() {
  const warnings = [];

  // Unassigned stats
  if (appState.unassigned.length > 0) {
    warnings.push({ text: `Warning: ${appState.unassigned.length} stats unassigned`, cls: 'warn' });
  }

  // Empty areas (gate-only areas are acceptable, just informational)
  for (const pn of ['north','south','east','west']) {
    for (let i = 0; i < appState.paths[pn].areas.length; i++) {
      const area = appState.paths[pn].areas[i];
      if (area.stats.length === 0 && !area.gate) {
        warnings.push({ text: `Warning: Path ${pn} Area ${i + 1} has no stats or gate (will be skipped)`, cls: 'warn' });
      } else if (area.stats.length === 0 && area.gate) {
        warnings.push({ text: `Info: Path ${pn} Area ${i + 1} has gate only (no stat nodes)`, cls: 'info' });
      }
    }
  }

  // Gate with wrong tier
  for (const pn of ['north','south','east','west']) {
    for (let i = 0; i < appState.paths[pn].areas.length; i++) {
      const area = appState.paths[pn].areas[i];
      if (area.gate) {
        const def = getStatDef(area.gate);
        if (def && def.node_tier !== 'super_notable') {
          warnings.push({ text: `Error: Gate slot in ${pn} Area ${i + 1} has non-super_notable stat (${def.display_name})`, cls: 'fail' });
        }
      }
    }
  }

  // Zero counts
  for (const pn of ['north','south','east','west']) {
    for (const area of appState.paths[pn].areas) {
      for (const s of area.stats) {
        if (s.count <= 0) {
          const def = getStatDef(s.statId);
          warnings.push({ text: `Warning: stat ${def ? def.display_name : s.statId} has count 0`, cls: 'warn' });
        }
      }
    }
  }
  for (const g of appState.global) {
    if (g.count <= 0) {
      const def = getStatDef(g.statId);
      warnings.push({ text: `Warning: global stat ${def ? def.display_name : g.statId} has count 0`, cls: 'warn' });
    }
  }

  // Check if anything to generate
  let hasAnything = false;
  for (const pn of ['north','south','east','west']) {
    if (appState.paths[pn].areas.length > 0) hasAnything = true;
  }
  if (appState.global.length > 0) hasAnything = true;
  if (!hasAnything) {
    warnings.push({ text: 'Error: No areas or global stats to generate', cls: 'fail' });
  }

  return warnings;
}

function generateTree() {
  const validationEl = document.getElementById('validationOutput');
  validationEl.innerHTML = '';

  // Open validation section if collapsed
  const valSection = document.getElementById('sectionValidation');
  if (valSection.classList.contains('collapsed')) {
    valSection.classList.remove('collapsed');
  }

  // Check if stat registry is loaded
  if (appState.statRegistry.length === 0) {
    // Check if user has any assignments (using TEST_STATS fallback)
    let hasAssignment = false;
    for (const pn of ['north','south','east','west']) {
      if (appState.paths[pn].areas.length > 0) hasAssignment = true;
    }
    if (appState.global.length > 0) hasAssignment = true;

    if (!hasAssignment) {
      // No stats AND no assignments - show helpful message but proceed with test data
      const warnLine = document.createElement('div');
      warnLine.className = 'warn';
      warnLine.textContent = 'No stat registry loaded. Using built-in test stats for demo.';
      validationEl.appendChild(warnLine);
      const helpLine = document.createElement('div');
      helpLine.className = 'info';
      helpLine.textContent = 'Tip: Load stat-registry.json to use your own stats, then assign them to paths.';
      validationEl.appendChild(helpLine);
    }
  }

  // Pre-generation warnings
  const preWarnings = runPreGenerationWarnings();
  if (preWarnings.length > 0) {
    const preHeader = document.createElement('div');
    preHeader.style.color = '#ffaa00';
    preHeader.style.fontWeight = 'bold';
    preHeader.style.marginBottom = '4px';
    preHeader.textContent = '-- Pre-Generation --';
    validationEl.appendChild(preHeader);
    for (const w of preWarnings) {
      const line = document.createElement('div');
      line.className = w.cls;
      line.textContent = w.text;
      validationEl.appendChild(line);
    }
  }

  // Check for fatal errors
  const hasFatal = preWarnings.some(w => w.cls === 'fail');

  // Determine stat registry and config to use
  let registry = appState.statRegistry.length > 0 ? appState.statRegistry : TEST_STATS;
  let config;

  // If nothing is assigned, check if we have anything at all
  let hasAssignment = false;
  for (const pn of ['north','south','east','west']) {
    if (appState.paths[pn].areas.length > 0) hasAssignment = true;
  }
  if (appState.global.length > 0) hasAssignment = true;

  if (hasAssignment) {
    config = buildConfigFromUI();
  } else {
    // Fallback to large test config
    config = TEST_CONFIGS.large;
    const fallbackNote = document.createElement('div');
    fallbackNote.className = 'info';
    fallbackNote.textContent = 'Using fallback test config (large) - assign stats in sidebar to use your own';
    validationEl.appendChild(fallbackNote);
  }

  const seed = parseInt(document.getElementById('edSeed').value) || 42;

  try {
    const engine = new LayoutEngine(config, registry, seed);
    const result = engine.generate();
    appState.lastResult = result;

    // Validate
    const validation = validateLayout(result);

    const postHeader = document.createElement('div');
    postHeader.style.color = '#aaa';
    postHeader.style.fontWeight = 'bold';
    postHeader.style.marginTop = '8px';
    postHeader.style.marginBottom = '4px';
    postHeader.textContent = '-- Validation --';
    validationEl.appendChild(postHeader);

    for (const entry of validation.log) {
      const line = document.createElement('div');
      line.className = entry.cls || 'info';
      line.textContent = entry.text;
      validationEl.appendChild(line);
    }

    // Render canvas
    renderCanvas(result);
    renderMinimap(result);

  } catch (err) {
    const errLine = document.createElement('div');
    errLine.className = 'fail';
    errLine.textContent = `ERROR: ${err.message}`;
    validationEl.appendChild(errLine);
    console.error(err);
  }
}

function exportJSON() {
  if (!appState.lastResult) {
    alert('No tree to export. Click "Generate Tree" first to create a skill tree layout.');
    return;
  }
  if (appState.lastResult.nodes.length <= 1) {
    alert('The generated tree only contains the root node. Add stat assignments and regenerate before exporting.');
    return;
  }

  // Build the skill-tree.json format
  const result = appState.lastResult;

  // Map path -> area number -> gate stat id, built from gate nodes.
  const gateByPathArea = {};
  for (const n of result.nodes) {
    if (n._isGate && n._path && n._area) {
      if (!gateByPathArea[n._path]) gateByPathArea[n._path] = {};
      gateByPathArea[n._path][n._area] = n.stat;
    }
  }

  // Return the stat id of the nearest prior gate for this node,
  // or undefined if the node is root, intro, ungated, or the first gate in its path.
  function computeGatedBy(n) {
    if (n.isRoot) return undefined;
    if (!n._path) return undefined;
    if (!n._area) return undefined; // 0 or null => intro / per-path global / fallback
    const gates = gateByPathArea[n._path] || {};
    const startArea = n._isGate ? n._area - 1 : n._area;
    for (let a = startArea; a >= 1; a--) {
      if (gates[a]) return gates[a];
    }
    return undefined;
  }

  const exportNode = n => {
    const out = {
      id: n.id,
      levels: n.levels,
      x: n.x,
      y: n.y,
    };
    if (n.name) out.name = n.name;
    if (n.stat) out.stat = n.stat;
    if (n.isRoot) out.isRoot = true;
    if (n.isNotable) out.isNotable = true;
    if (n.isSuperNotable) out.isSuperNotable = true;
    if (n._path) out.path = n._path;
    if (n._area != null) out.area = n._area;
    const gatedBy = computeGatedBy(n);
    if (gatedBy !== undefined) out.gated_by = gatedBy;
    return out;
  };
  const exportNodes = result.nodes.map(exportNode);
  const exportConns = result.connections.map(c => ({
    from: { x: c.from.x, y: c.from.y },
    to: { x: c.to.x, y: c.to.y },
  }));
  const output = { nodes: exportNodes, connections: exportConns };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skill-tree.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
