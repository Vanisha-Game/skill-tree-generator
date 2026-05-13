function addArea(path) {
  appState.paths[path].areas.push({
    gate: null,
    stats: [],
  });
  renderAllAreas();
}

function removeArea(path, index) {
  const area = appState.paths[path].areas[index];
  // Return all stats and gate to unassigned
  if (area.gate) appState.unassigned.push(area.gate);
  for (const s of area.stats) {
    if (!appState.unassigned.includes(s.statId)) {
      appState.unassigned.push(s.statId);
    }
  }
  appState.paths[path].areas.splice(index, 1);
  renderAllAreas();
  renderUnassigned();
}

function renderAllAreas() {
  for (const pn of ['north','south','east','west']) {
    renderPathAreas(pn);
    renderPathGlobal(pn);
  }
  if (activeTab === 'editor' && !_renderingEditor) {
    _renderingEditor = true;
    renderEditorAreas();
    _renderingEditor = false;
  }
  autoSave();
}

function renderPathAreas(path) {
  const containerId = `areas${path.charAt(0).toUpperCase() + path.slice(1)}`;
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const areas = appState.paths[path].areas;
  for (let i = 0; i < areas.length; i++) {
    container.appendChild(createAreaPanel(path, i, areas[i]));
  }
}

function createAreaPanel(path, index, area) {
  const panel = document.createElement('div');
  panel.className = 'area-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'area-header';

  const leftGroup = document.createElement('div');
  leftGroup.style.cssText = 'display:flex;align-items:center;gap:4px';

  const grip = document.createElement('span');
  grip.className = 'area-drag-handle';
  grip.textContent = '\u2630';
  grip.title = 'Drag to reorder';
  grip.draggable = true;

  grip.addEventListener('dragstart', function(e) {
    e.stopPropagation();
    panel.classList.add('area-dragging');
    document.body.classList.add('dragging-active');
    dragSource = { type: 'area-reorder', path, areaIndex: index };
    e.dataTransfer.setData('text/x-area-reorder', JSON.stringify({ path, areaIndex: index }));
    e.dataTransfer.effectAllowed = 'move';
  });
  grip.addEventListener('dragend', function() {
    panel.classList.remove('area-dragging');
    document.body.classList.remove('dragging-active');
    dragSource = null;
    document.querySelectorAll('.area-drag-over-above, .area-drag-over-below').forEach(el => {
      el.classList.remove('area-drag-over-above', 'area-drag-over-below');
    });
  });

  const posLabel = document.createElement('span');
  posLabel.textContent = `Area ${index + 1}`;

  leftGroup.appendChild(grip);
  leftGroup.appendChild(posLabel);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-area';
  removeBtn.innerHTML = '&times;';
  removeBtn.title = 'Remove area';
  removeBtn.onclick = () => removeArea(path, index);
  header.appendChild(leftGroup);
  header.appendChild(removeBtn);
  panel.appendChild(header);

  // Area reorder drop target
  panel.addEventListener('dragover', function(e) {
    if (!dragSource || dragSource.type !== 'area-reorder') return;
    if (dragSource.path !== path) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = panel.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      panel.classList.add('area-drag-over-above');
      panel.classList.remove('area-drag-over-below');
    } else {
      panel.classList.add('area-drag-over-below');
      panel.classList.remove('area-drag-over-above');
    }
  });
  panel.addEventListener('dragleave', function(e) {
    if (!panel.contains(e.relatedTarget)) {
      panel.classList.remove('area-drag-over-above', 'area-drag-over-below');
    }
  });
  panel.addEventListener('drop', function(e) {
    e.preventDefault();
    panel.classList.remove('area-drag-over-above', 'area-drag-over-below');
    if (!dragSource || dragSource.type !== 'area-reorder') return;
    if (dragSource.path !== path) return;

    const fromIndex = dragSource.areaIndex;
    const rect = panel.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    let toIndex = e.clientY < midY ? index : index + 1;

    // Adjust for the removal of the source element
    if (fromIndex < toIndex) toIndex--;
    if (fromIndex === toIndex) return;

    const areas = appState.paths[path].areas;
    const [moved] = areas.splice(fromIndex, 1);
    areas.splice(toIndex, 0, moved);

    renderAllAreas();
    renderUnassigned();
  });

  // Gate slot
  const gateTarget = { type: 'gate', path, areaIndex: index };
  const gateZone = document.createElement('div');
  gateZone.className = 'gate-slot';
  gateZone.ondragover = (e) => handleDragOver(e, gateTarget);
  gateZone.ondragenter = (e) => handleDragEnter(e, gateTarget);
  gateZone.ondragleave = (e) => handleDragLeave(e);
  gateZone.ondrop = (e) => handleDrop(e, gateTarget);

  if (area.gate) {
    const source = { type: 'gate', path, areaIndex: index };
    gateZone.appendChild(createStatCard(area.gate, source));
  } else {
    const lbl = document.createElement('span');
    lbl.className = 'gate-label';
    lbl.textContent = 'Gate (super notable only)';
    gateZone.appendChild(lbl);
  }
  panel.appendChild(gateZone);

  // Stat drop zone
  const statTarget = { type: 'stat', path, areaIndex: index };
  const statZone = document.createElement('div');
  statZone.className = 'drop-zone';
  statZone.ondragover = (e) => handleDragOver(e, statTarget);
  statZone.ondragenter = (e) => handleDragEnter(e, statTarget);
  statZone.ondragleave = (e) => handleDragLeave(e);
  statZone.ondrop = (e) => handleDrop(e, statTarget);

  if (area.stats.length === 0) {
    const lbl = document.createElement('span');
    lbl.className = 'drop-zone-label';
    lbl.textContent = 'Drop stats here';
    statZone.appendChild(lbl);
  }

  for (const s of area.stats) {
    const source = { type: 'stat', path, areaIndex: index };
    statZone.appendChild(createStatCard(s.statId, source));
  }
  panel.appendChild(statZone);

  // Per-stat count spinners
  if (area.stats.length > 0) {
    const statsDiv = document.createElement('div');
    statsDiv.className = 'mt-4';
    for (let si = 0; si < area.stats.length; si++) {
      const s = area.stats[si];
      const def = getStatDef(s.statId);
      const row = document.createElement('div');
      row.className = 'assigned-stat';

      const badge = document.createElement('span');
      badge.className = 'tier-badge';
      badge.style.background = (def && def.node_tier === 'super_notable') ? '#d4a017' : (def && def.node_tier === 'notable') ? '#4488ff' : '#666';
      badge.style.width = '6px';
      badge.style.height = '6px';
      badge.style.borderRadius = '50%';
      badge.style.display = 'inline-block';
      badge.style.flexShrink = '0';

      const nameEl = document.createElement('span');
      nameEl.className = 'stat-name';
      nameEl.textContent = def ? def.display_name : s.statId;

      const spinner = document.createElement('div');
      spinner.className = 'count-spinner';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.value = s.count;
      // Capture index for closure
      const statIndex = si;
      const pathName = path;
      const areaIndex = index;
      input.onchange = function() {
        const v = parseInt(this.value) || 1;
        this.value = Math.max(1, v);
        appState.paths[pathName].areas[areaIndex].stats[statIndex].count = Math.max(1, v);
        autoSave();
      };

      const removeLink = document.createElement('button');
      removeLink.className = 'btn-remove-area';
      removeLink.innerHTML = '&times;';
      removeLink.style.fontSize = '12px';
      removeLink.title = 'Remove stat';
      removeLink.onclick = function() {
        const removed = appState.paths[pathName].areas[areaIndex].stats.splice(statIndex, 1);
        if (removed.length && !appState.unassigned.includes(removed[0].statId)) {
          appState.unassigned.push(removed[0].statId);
        }
        renderAllAreas();
        renderUnassigned();
      };

      spinner.appendChild(input);

      row.appendChild(badge);
      row.appendChild(nameEl);
      row.appendChild(spinner);
      row.appendChild(removeLink);
      statsDiv.appendChild(row);
    }
    panel.appendChild(statsDiv);
  }

  return panel;
}

// ---- Path Global ----
function renderPathGlobal(path) {
  const pool = document.getElementById(path + 'GlobalPool');
  const list = document.getElementById(path + 'GlobalList');
  if (!pool || !list) return;
  pool.innerHTML = '';
  list.innerHTML = '';

  const pathGlobal = appState.paths[path].global;

  if (pathGlobal.length === 0) {
    const lbl = document.createElement('span');
    lbl.className = 'drop-zone-label';
    lbl.textContent = 'Drop stats here';
    pool.appendChild(lbl);
  }

  for (const g of pathGlobal) {
    pool.appendChild(createStatCard(g.statId, { type: 'pathGlobal', path }));
  }

  if (pathGlobal.length > 0) {
    for (let gi = 0; gi < pathGlobal.length; gi++) {
      const g = pathGlobal[gi];
      const def = getStatDef(g.statId);
      const row = document.createElement('div');
      row.className = 'assigned-stat';

      const badge = document.createElement('span');
      badge.className = 'tier-badge';
      badge.style.background = def && def.node_tier === 'notable' ? '#4488ff' : '#666';
      badge.style.width = '6px';
      badge.style.height = '6px';
      badge.style.borderRadius = '50%';
      badge.style.display = 'inline-block';
      badge.style.flexShrink = '0';

      const nameEl = document.createElement('span');
      nameEl.className = 'stat-name';
      nameEl.textContent = def ? def.display_name : g.statId;

      const spinner = document.createElement('div');
      spinner.className = 'count-spinner';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.value = g.count;
      const gIdx = gi;
      const pathRef = path;
      input.onchange = function() {
        const v = parseInt(this.value) || 1;
        this.value = Math.max(1, v);
        appState.paths[pathRef].global[gIdx].count = Math.max(1, v);
        renderAllAreas();
      };

      const removeLink = document.createElement('button');
      removeLink.className = 'btn-remove-area';
      removeLink.innerHTML = '&times;';
      removeLink.style.fontSize = '12px';
      removeLink.title = 'Remove stat';
      removeLink.onclick = function() {
        const removed = appState.paths[pathRef].global.splice(gIdx, 1);
        if (removed.length && !appState.unassigned.includes(removed[0].statId)) {
          appState.unassigned.push(removed[0].statId);
        }
        renderAllAreas();
        renderUnassigned();
      };

      spinner.appendChild(input);
      row.appendChild(badge);
      row.appendChild(nameEl);
      row.appendChild(spinner);
      row.appendChild(removeLink);
      list.appendChild(row);
    }
  }

  const countEl = document.getElementById(path + 'GlobalCount');
  if (countEl) countEl.textContent = pathGlobal.length;
}

// ---- Global Bucket ----
function renderGlobalBucket() {
  const pool = document.getElementById('globalPool');
  const list = document.getElementById('globalStatsList');
  if (!pool || !list) {
    if (activeTab === 'editor' && !_renderingEditor) {
      _renderingEditor = true;
      renderEditorGlobalBucket();
      _renderingEditor = false;
    }
    return;
  }
  pool.innerHTML = '';
  list.innerHTML = '';

  if (appState.global.length === 0) {
    const lbl = document.createElement('span');
    lbl.className = 'drop-zone-label';
    lbl.textContent = 'Drop stats here';
    pool.appendChild(lbl);
  }

  for (const g of appState.global) {
    pool.appendChild(createStatCard(g.statId, 'global'));
  }

  // Count spinners for global stats
  if (appState.global.length > 0) {
    for (let gi = 0; gi < appState.global.length; gi++) {
      const g = appState.global[gi];
      const def = getStatDef(g.statId);
      const row = document.createElement('div');
      row.className = 'assigned-stat';

      const badge = document.createElement('span');
      badge.className = 'tier-badge';
      badge.style.background = def && def.node_tier === 'notable' ? '#4488ff' : '#666';
      badge.style.width = '6px';
      badge.style.height = '6px';
      badge.style.borderRadius = '50%';
      badge.style.display = 'inline-block';
      badge.style.flexShrink = '0';

      const nameEl = document.createElement('span');
      nameEl.className = 'stat-name';
      nameEl.textContent = def ? def.display_name : g.statId;

      const spinner = document.createElement('div');
      spinner.className = 'count-spinner';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.value = g.count;
      const gIdx = gi;
      input.onchange = function() {
        const v = parseInt(this.value) || 1;
        this.value = Math.max(1, v);
        appState.global[gIdx].count = Math.max(1, v);
        autoSave();
      };

      const removeLink = document.createElement('button');
      removeLink.className = 'btn-remove-area';
      removeLink.innerHTML = '&times;';
      removeLink.style.fontSize = '12px';
      removeLink.title = 'Remove stat';
      removeLink.onclick = function() {
        const removed = appState.global.splice(gIdx, 1);
        if (removed.length && !appState.unassigned.includes(removed[0].statId)) {
          appState.unassigned.push(removed[0].statId);
        }
        renderGlobalBucket();
        renderUnassigned();
      };

      spinner.appendChild(input);

      row.appendChild(badge);
      row.appendChild(nameEl);
      row.appendChild(spinner);
      row.appendChild(removeLink);
      list.appendChild(row);
    }
  }

  const globalCountEl = document.getElementById('globalCount');
  if (globalCountEl) globalCountEl.textContent = appState.global.length;

  if (activeTab === 'editor' && !_renderingEditor) {
    _renderingEditor = true;
    renderEditorGlobalBucket();
    _renderingEditor = false;
  }
}
