function renderEditorUnassigned() {
  const pool = document.getElementById('edUnassignedPool');
  const searchEl = document.getElementById('edStatSearch');
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
    pool.appendChild(lbl);
  }

  for (const statId of filtered) {
    pool.appendChild(createStatCard(statId, 'unassigned'));
  }

  const countEl = document.getElementById('edUnassignedCount');
  if (countEl) countEl.textContent = appState.unassigned.length;
  renderEditorNotApplicable();
}

function toggleNASection() {
  const body = document.getElementById('naBody');
  const toggle = document.getElementById('naToggle');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  toggle.classList.toggle('open', !open);
}

function renderEditorNotApplicable() {
  const pool = document.getElementById('edNAPool');
  if (!pool) return;
  pool.innerHTML = '';

  if (appState.notApplicable.length === 0) {
    const lbl = document.createElement('span');
    lbl.className = 'drop-zone-label';
    lbl.textContent = 'Drag stats here to exclude from tree';
    pool.appendChild(lbl);
  }

  for (const statId of appState.notApplicable) {
    pool.appendChild(createStatCard(statId, 'notApplicable'));
  }

  const countEl = document.getElementById('edNACount');
  if (countEl) countEl.textContent = appState.notApplicable.length;
}

function renderEditorAreas() {
  const path = activeEditorPath;
  const container = document.getElementById('activePathPanel');
  if (!container) return;
  container.innerHTML = '';

  // Build the single path panel dynamically
  const capPath = path.charAt(0).toUpperCase() + path.slice(1);
  const panel = document.createElement('div');
  panel.className = `editor-path-panel path-${path}`;

  // Header
  const header = document.createElement('div');
  header.className = 'path-panel-header';
  const h3 = document.createElement('h3');
  h3.textContent = capPath;
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-sm';
  addBtn.textContent = '+ Add Area';
  addBtn.onclick = () => addArea(path);
  header.appendChild(h3);
  header.appendChild(addBtn);
  panel.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'path-panel-body';

  // Path Global section
  const globalSection = document.createElement('div');
  globalSection.className = 'path-global-section';
  const globalH4 = document.createElement('h4');
  globalH4.style.cssText = 'font-size:14px;margin:0 0 6px;color:#aaa;';
  const globalCount = document.createElement('span');
  globalCount.id = `ed${capPath}GlobalCount`;
  globalCount.textContent = appState.paths[path].global.length;
  globalH4.textContent = 'Path Global (';
  globalH4.appendChild(globalCount);
  globalH4.appendChild(document.createTextNode(')'));
  globalSection.appendChild(globalH4);

  const globalPool = document.createElement('div');
  globalPool.className = 'drop-zone';
  globalPool.id = `ed${capPath}GlobalPool`;
  globalPool.ondragover = (e) => handleDragOver(e, {type:'pathGlobal',path});
  globalPool.ondragenter = (e) => handleDragEnter(e, {type:'pathGlobal',path});
  globalPool.ondragleave = (e) => handleDragLeave(e);
  globalPool.ondrop = (e) => handleDrop(e, {type:'pathGlobal',path});
  globalSection.appendChild(globalPool);

  const globalList = document.createElement('div');
  globalList.id = `ed${capPath}GlobalList`;
  globalSection.appendChild(globalList);

  body.appendChild(globalSection);

  const hr = document.createElement('hr');
  hr.style.cssText = 'border-color:#333;margin:10px 0;';
  body.appendChild(hr);

  const areasDiv = document.createElement('div');
  areasDiv.id = `edAreas${capPath}`;
  body.appendChild(areasDiv);

  panel.appendChild(body);
  container.appendChild(panel);

  // Now populate the areas and path global
  renderEditorPathAreas(path);
  renderEditorPathGlobal(path);
}

function renderEditorPathAreas(path) {
  const containerId = `edAreas${path.charAt(0).toUpperCase() + path.slice(1)}`;
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const areas = appState.paths[path].areas;
  for (let i = 0; i < areas.length; i++) {
    container.appendChild(createAreaPanel(path, i, areas[i]));
  }
}

function renderEditorPathGlobal(path) {
  const capPath = path.charAt(0).toUpperCase() + path.slice(1);
  const pool = document.getElementById('ed' + capPath + 'GlobalPool');
  const list = document.getElementById('ed' + capPath + 'GlobalList');
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
      badge.style.width = '8px';
      badge.style.height = '8px';
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
      removeLink.style.fontSize = '14px';
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

  const countEl = document.getElementById('ed' + capPath + 'GlobalCount');
  if (countEl) countEl.textContent = pathGlobal.length;
}

function renderEditorGlobalBucket() {
  const pool = document.getElementById('edGlobalPool');
  const list = document.getElementById('edGlobalStatsList');
  if (!pool || !list) return;
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

  const countEl = document.getElementById('edGlobalCount');
  if (countEl) countEl.textContent = appState.global.length;
}
