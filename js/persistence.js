document.getElementById('fileRegistry').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      const stats = data.stats || data;
      if (!Array.isArray(stats) || stats.length === 0) throw new Error('No stats array found');
      appState.statRegistry = stats;
      appState.statLookup = {};
      for (const s of stats) appState.statLookup[s.stat] = s;
      // Reset assignments
      appState.unassigned = stats.map(s => s.stat);
      for (const pn of ['north','south','east','west']) { appState.paths[pn].areas = []; appState.paths[pn].global = []; }
      appState.global = [];

      // Check localStorage for a saved config and re-apply it
      let restoredFromStorage = false;
      let removedCount = 0;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.config) {
            removedCount = loadConfig(saved.config);
            if (saved.seed != null) document.getElementById('edSeed').value = saved.seed;
            restoredFromStorage = true;
          }
        }
      } catch (e) { /* no saved config or parse error, continue with clean state */ }

      if (!restoredFromStorage) {
        renderAllAreas();
        renderGlobalBucket();
        renderUnassigned();
      }
      let statusMsg = restoredFromStorage
        ? `Loaded ${stats.length} stats + restored config from session`
        : `Loaded ${stats.length} stats`;
      if (removedCount > 0) statusMsg += ` (removed ${removedCount} deleted stat(s))`;
      setStatus('fileStatus', statusMsg, 'ok');
    } catch (err) {
      setStatus('fileStatus', `Error: ${err.message}`, 'err');
    }
  };
  reader.readAsText(file);
  // Reset to allow re-loading same file
  this.value = '';
});

// ---- File Watching ----
let _watchHandle = null;
let _watchInterval = null;
let _watchLastModified = 0;

async function selectAndWatchRegistry() {
  // Stop any existing watch
  if (_watchInterval) clearInterval(_watchInterval);
  _watchInterval = null;

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    _watchHandle = handle;
    // Initial load (full reset since this is a new file selection)
    await readWatchedFile(true);
    // Start auto-watching
    _watchInterval = setInterval(() => readWatchedFile(false), 2000);
    const btn = document.getElementById('btnLoadRegistry');
    btn.textContent = 'Watching stat-registry.json';
    btn.classList.add('watching');
  } catch (err) {
    if (err.name !== 'AbortError') {
      setStatus('fileStatus', `Error: ${err.message}`, 'err');
    }
  }
}

async function readWatchedFile(isInitial) {
  if (!_watchHandle) return;
  try {
    const file = await _watchHandle.getFile();
    if (!isInitial && file.lastModified === _watchLastModified) return;
    _watchLastModified = file.lastModified;

    const text = await file.text();
    const data = JSON.parse(text);
    const stats = data.stats || data;
    if (!Array.isArray(stats) || stats.length === 0) throw new Error('No stats array found');

    if (isInitial) {
      // First load: full reset + restore config
      appState.statRegistry = stats;
      appState.statLookup = {};
      for (const s of stats) appState.statLookup[s.stat] = s;
      appState.unassigned = stats.map(s => s.stat);
      for (const pn of ['north','south','east','west']) { appState.paths[pn].areas = []; appState.paths[pn].global = []; }
      appState.global = [];

      let restoredFromStorage = false;
      let removedCount = 0;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.config) {
            removedCount = loadConfig(saved.config);
            if (saved.seed != null) document.getElementById('edSeed').value = saved.seed;
            restoredFromStorage = true;
          }
        }
      } catch (e) { /* ignore */ }

      if (!restoredFromStorage) {
        renderAllAreas();
        renderGlobalBucket();
        renderUnassigned();
      }
      let statusMsg = `Watching ${file.name} (${stats.length} stats)`;
      if (removedCount > 0) statusMsg += ` (removed ${removedCount} deleted stat(s))`;
      setStatus('fileStatus', statusMsg, 'ok');
    } else {
      // Subsequent updates: merge definitions, keep assignments
      applyRegistryUpdate(stats);
      const time = new Date(file.lastModified).toLocaleTimeString();
      setStatus('fileStatus', `Updated ${stats.length} stats at ${time}`, 'ok');
    }
  } catch (err) {
    setStatus('fileStatus', `Watch error: ${err.message}`, 'err');
  }
}

function applyRegistryUpdate(newStats) {
  const newLookup = {};
  for (const s of newStats) newLookup[s.stat] = s;

  appState.statRegistry = newStats;
  appState.statLookup = newLookup;

  // Add new stats to unassigned
  const allAssigned = new Set();
  for (const pn of ['north','south','east','west']) {
    for (const area of appState.paths[pn].areas) {
      if (area.gate) allAssigned.add(area.gate);
      for (const e of area.stats) allAssigned.add(e.statId);
    }
    for (const e of appState.paths[pn].global) allAssigned.add(e.statId);
  }
  for (const e of appState.global) allAssigned.add(e.statId);
  for (const id of appState.unassigned) allAssigned.add(id);

  for (const s of newStats) {
    if (!allAssigned.has(s.stat)) {
      appState.unassigned.push(s.stat);
    }
  }

  // Remove deleted stats from all locations
  const validIds = new Set(newStats.map(s => s.stat));
  appState.unassigned = appState.unassigned.filter(id => validIds.has(id));
  for (const pn of ['north','south','east','west']) {
    for (const area of appState.paths[pn].areas) {
      if (area.gate && !validIds.has(area.gate)) area.gate = null;
      area.stats = area.stats.filter(e => validIds.has(e.statId));
    }
    appState.paths[pn].global = appState.paths[pn].global.filter(e => validIds.has(e.statId));
  }
  appState.global = appState.global.filter(e => validIds.has(e.statId));

  // Re-render current view
  renderAllAreas();
  renderGlobalBucket();
  renderUnassigned();
  if (activeTab === 'stats') renderStatsTab();
}

document.getElementById('fileConfig').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const cfg = JSON.parse(ev.target.result);
      loadConfig(cfg);
      setStatus('fileStatus', 'Config loaded', 'ok');
    } catch (err) {
      setStatus('fileStatus', `Config error: ${err.message}`, 'err');
    }
  };
  reader.readAsText(file);
  this.value = '';
});

function loadConfig(cfg) {
  if (appState.statRegistry.length === 0) {
    throw new Error('Load a stat-registry.json first before loading a config');
  }
  // Reset all assignments
  appState.unassigned = appState.statRegistry.map(s => s.stat);
  for (const pn of ['north','south','east','west']) { appState.paths[pn].areas = []; appState.paths[pn].global = []; }
  appState.global = [];
  appState.notApplicable = [];

  // Build set of valid stat IDs for cleanup of removed stats
  const validIds = new Set(appState.statRegistry.map(s => s.stat));
  let removedCount = 0;

  // Load paths
  for (const pn of ['north','south','east','west']) {
    if (cfg.paths && cfg.paths[pn]) {
      if (cfg.paths[pn].areas) {
        for (const area of cfg.paths[pn].areas) {
          const newArea = {
            gate: null,
            stats: [],
          };
          if (area.gate) {
            if (validIds.has(area.gate)) {
              newArea.gate = area.gate;
              removeFromUnassigned(area.gate);
            } else {
              removedCount++;
            }
          }
          for (const s of (area.stats || [])) {
            if (validIds.has(s.stat)) {
              newArea.stats.push({ statId: s.stat, count: s.count || 1 });
              removeFromUnassigned(s.stat);
            } else {
              removedCount++;
            }
          }
          appState.paths[pn].areas.push(newArea);
        }
      }
      if (cfg.paths[pn].global) {
        for (const g of cfg.paths[pn].global) {
          if (validIds.has(g.stat)) {
            appState.paths[pn].global.push({ statId: g.stat, count: g.count || 1 });
            removeFromUnassigned(g.stat);
          } else {
            removedCount++;
          }
        }
      }
    }
  }

  // Load global
  if (cfg.global) {
    for (const g of cfg.global) {
      if (validIds.has(g.stat)) {
        appState.global.push({ statId: g.stat, count: g.count || 1 });
        removeFromUnassigned(g.stat);
      } else {
        removedCount++;
      }
    }
  }

  // Load not-applicable
  if (cfg.notApplicable) {
    for (const statId of cfg.notApplicable) {
      if (validIds.has(statId)) {
        appState.notApplicable.push(statId);
        removeFromUnassigned(statId);
      } else {
        removedCount++;
      }
    }
  }

  if (removedCount > 0) {
    console.warn(`loadConfig: skipped ${removedCount} stat(s) not found in current registry`);
  }

  if (cfg.seed != null) document.getElementById('edSeed').value = cfg.seed;
  if (cfg.introNodesPerPath != null) document.getElementById('edIntroNodes').value = cfg.introNodesPerPath;
  if (cfg.spilloverPercent != null) document.getElementById('edSpillover').value = cfg.spilloverPercent;

  renderAllAreas();
  renderGlobalBucket();
  renderUnassigned();
  return removedCount;
}

function saveConfig() {
  const cfg = buildConfigFromUI();
  cfg.seed = parseInt(document.getElementById('edSeed').value) || 42;
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skill-tree-config.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Auto-save to localStorage ----
const STORAGE_KEY = 'skillTreeGeneratorState';
let _autoSaveTimer = null;

function autoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    try {
      const saved = {
        statRegistry: appState.statRegistry,
        config: buildConfigFromUI(),
        seed: parseInt(document.getElementById('edSeed').value) || 42,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (e) { /* localStorage full or unavailable */ }
  }, 300);
}

function autoLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.statRegistry || !saved.statRegistry.length) return false;

    // Restore stat registry
    appState.statRegistry = saved.statRegistry;
    appState.statLookup = {};
    for (const s of saved.statRegistry) appState.statLookup[s.stat] = s;
    appState.unassigned = saved.statRegistry.map(s => s.stat);

    // Restore config (paths, global)
    if (saved.config) {
      loadConfig(saved.config);
      if (saved.seed != null) document.getElementById('edSeed').value = saved.seed;
    }

    setStatus('fileStatus', `Restored ${saved.statRegistry.length} stats from session`, 'ok');
    return true;
  } catch (e) {
    console.warn('autoLoad failed:', e);
    return false;
  }
}

function buildConfigFromUI() {
  const config = {
    paths: {},
    global: [],
  };

  config.introNodesPerPath = parseInt(document.getElementById('edIntroNodes').value) || 0;
  config.spilloverPercent = parseInt(document.getElementById('edSpillover').value) || 0;

  for (const pn of ['north','south','east','west']) {
    config.paths[pn] = {
      areas: appState.paths[pn].areas.map((a, i) => ({
        position: i + 1,
        gate: a.gate || null,
        stats: a.stats.map(s => ({ stat: s.statId, count: s.count })),
      })),
      global: appState.paths[pn].global.map(g => ({ stat: g.statId, count: g.count })),
    };
  }

  config.global = appState.global.map(g => ({ stat: g.statId, count: g.count }));
  config.notApplicable = [...appState.notApplicable];

  return config;
}
