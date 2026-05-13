// Track what's being dragged
let dragSource = null; // { statId, from: 'unassigned'|'global'|{path,areaIndex,type:'stat'|'gate'} }

// ---- Render Unassigned Pool ----
function renderUnassigned() {
  const pool = document.getElementById('unassignedPool');
  if (!pool) {
    if (activeTab === 'editor' && !_renderingEditor) {
      _renderingEditor = true;
      renderEditorUnassigned();
      _renderingEditor = false;
    }
    return;
  }
  const searchEl = document.getElementById('statSearch');
  const search = searchEl ? searchEl.value.toLowerCase() : '';

  pool.innerHTML = '';
  const filtered = appState.unassigned.filter(id => {
    if (!search) return true;
    const def = getStatDef(id);
    return def && def.display_name.toLowerCase().includes(search);
  });

  if (filtered.length === 0) {
    const lbl = document.createElement('span');
    lbl.className = 'drop-zone-label';
    lbl.textContent = appState.statRegistry.length === 0 ? 'Load a stat registry to begin' : (search ? 'No matches' : 'All stats assigned');
    lbl.id = 'unassignedPlaceholder';
    pool.appendChild(lbl);
  }

  for (const statId of filtered) {
    pool.appendChild(createStatCard(statId, 'unassigned'));
  }

  const unassignedCount = document.getElementById('unassignedCount');
  if (unassignedCount) unassignedCount.textContent = appState.unassigned.length;

  if (activeTab === 'editor' && !_renderingEditor) {
    _renderingEditor = true;
    renderEditorUnassigned();
    _renderingEditor = false;
  }
}

function filterUnassigned() {
  renderUnassigned();
}

// ---- Create Stat Card ----
function createStatCard(statId, source) {
  const def = getStatDef(statId);
  if (!def) return document.createTextNode('?');

  const card = document.createElement('div');
  card.className = `stat-card tier-${def.node_tier}`;
  card.draggable = true;
  card.dataset.statId = statId;
  card.dataset.source = typeof source === 'string' ? source : JSON.stringify(source);

  const badge = document.createElement('span');
  badge.className = 'tier-badge';
  badge.title = def.node_tier;

  const name = document.createElement('span');
  name.textContent = def.display_name;

  card.appendChild(badge);
  card.appendChild(name);

  card.addEventListener('dragstart', function(e) {
    card.classList.add('dragging');
    document.body.classList.add('dragging-active');
    dragSource = { statId, from: source };
    e.dataTransfer.setData('text/plain', statId);
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', function() {
    card.classList.remove('dragging');
    document.body.classList.remove('dragging-active');
    dragSource = null;
    // Clean up any lingering highlights
    document.querySelectorAll('.drag-over, .drag-invalid').forEach(el => {
      el.classList.remove('drag-over', 'drag-invalid');
    });
  });

  return card;
}

// ---- Drag and Drop Handlers ----
function handleDragOver(e, target) {
  e.preventDefault();
  // Set appropriate drop effect based on tier validation
  if (dragSource) {
    const def = getStatDef(dragSource.statId);
    if (def) {
      let valid = true;
      if (typeof target === 'object' && target.type === 'gate' && def.node_tier !== 'super_notable') valid = false;
      if (target === 'global' && def.node_tier === 'super_notable') valid = false;
      if (typeof target === 'object' && target.type === 'pathGlobal' && def.node_tier === 'super_notable') valid = false;
      e.dataTransfer.dropEffect = valid ? 'move' : 'none';
      return;
    }
  }
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e, target) {
  e.preventDefault();
  const zone = e.currentTarget;

  if (!dragSource) { zone.classList.add('drag-over'); return; }

  const def = getStatDef(dragSource.statId);
  if (!def) return;

  // Validate tier for target
  if (typeof target === 'object' && target.type === 'gate') {
    // Gate slots only accept super_notable
    if (def.node_tier === 'super_notable') {
      zone.classList.add('drag-over');
    } else {
      zone.classList.add('drag-invalid');
    }
  } else if (target === 'unassigned' || target === 'notApplicable') {
    zone.classList.add('drag-over');
  } else if (typeof target === 'object' && target.type === 'stat') {
    zone.classList.add('drag-over');
  } else if (target === 'global') {
    // Global accepts basic and notable only
    if (def.node_tier !== 'super_notable') {
      zone.classList.add('drag-over');
    } else {
      zone.classList.add('drag-invalid');
    }
  } else if (typeof target === 'object' && target.type === 'pathGlobal') {
    if (def.node_tier !== 'super_notable') {
      zone.classList.add('drag-over');
    } else {
      zone.classList.add('drag-invalid');
    }
  } else {
    zone.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  // Only remove if we're actually leaving this zone
  const zone = e.currentTarget;
  const related = e.relatedTarget;
  if (related && zone.contains(related)) return;
  zone.classList.remove('drag-over', 'drag-invalid');
}

function handleDrop(e, target) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over', 'drag-invalid');

  if (!dragSource) return;
  const statId = dragSource.statId;
  const def = getStatDef(statId);
  if (!def) return;
  const from = dragSource.from;

  // Validate tier constraints
  if (typeof target === 'object' && target.type === 'gate') {
    if (def.node_tier !== 'super_notable') return;
  } else if (typeof target === 'object' && target.type === 'stat') {
    // All tiers accepted
  } else if (target === 'global') {
    if (def.node_tier === 'super_notable') return;
  } else if (typeof target === 'object' && target.type === 'pathGlobal') {
    if (def.node_tier === 'super_notable') return;
  }

  // Remove from source
  removeStatFromSource(statId, from);

  // Add to target
  if (target === 'unassigned') {
    if (!appState.unassigned.includes(statId)) {
      appState.unassigned.push(statId);
    }
  } else if (target === 'notApplicable') {
    if (!appState.notApplicable.includes(statId)) {
      appState.notApplicable.push(statId);
    }
  } else if (target === 'global') {
    const defaultCount = def.node_tier === 'notable' ? 1 : 3;
    // Check if already in global
    const existing = appState.global.find(g => g.statId === statId);
    if (!existing) {
      appState.global.push({ statId, count: defaultCount });
    }
  } else if (typeof target === 'object' && target.type === 'pathGlobal') {
    const defaultCount = def.node_tier === 'notable' ? 1 : 3;
    const pathGlobal = appState.paths[target.path].global;
    const existing = pathGlobal.find(g => g.statId === statId);
    if (!existing) {
      pathGlobal.push({ statId, count: defaultCount });
    }
  } else if (typeof target === 'object' && target.type === 'gate') {
    const area = appState.paths[target.path].areas[target.areaIndex];
    // Return previous gate to unassigned
    if (area.gate && area.gate !== statId) {
      appState.unassigned.push(area.gate);
    }
    area.gate = statId;
  } else if (typeof target === 'object' && target.type === 'stat') {
    const area = appState.paths[target.path].areas[target.areaIndex];
    const defaultCount = (def.node_tier === 'notable' || def.node_tier === 'super_notable') ? 1 : 3;
    const existing = area.stats.find(s => s.statId === statId);
    if (!existing) {
      area.stats.push({ statId, count: defaultCount });
    }
  }

  renderAllAreas();
  renderGlobalBucket();
  renderUnassigned();
}

function removeStatFromSource(statId, from) {
  if (from === 'unassigned') {
    removeFromUnassigned(statId);
  } else if (from === 'notApplicable') {
    appState.notApplicable = appState.notApplicable.filter(id => id !== statId);
  } else if (from === 'global') {
    appState.global = appState.global.filter(g => g.statId !== statId);
  } else if (typeof from === 'object' && from.type === 'gate') {
    const area = appState.paths[from.path].areas[from.areaIndex];
    if (area.gate === statId) area.gate = null;
  } else if (typeof from === 'object' && from.type === 'stat') {
    const area = appState.paths[from.path].areas[from.areaIndex];
    area.stats = area.stats.filter(s => s.statId !== statId);
  } else if (typeof from === 'object' && from.type === 'pathGlobal') {
    const pathGlobal = appState.paths[from.path].global;
    const idx = pathGlobal.findIndex(g => g.statId === statId);
    if (idx >= 0) pathGlobal.splice(idx, 1);
  }
}
