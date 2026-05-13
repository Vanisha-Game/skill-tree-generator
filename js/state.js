const appState = {
  statRegistry: [],     // loaded stat definitions
  paths: {
    north: { areas: [], global: [] },
    south: { areas: [], global: [] },
    east:  { areas: [], global: [] },
    west:  { areas: [], global: [] },
  },
  global: [],           // [{statId, count}]
  unassigned: [],       // stat IDs not yet assigned
  notApplicable: [],    // stat IDs excluded from the tree
  lastResult: null,     // last generated result for re-rendering
};

function removeFromUnassigned(statId) {
  const idx = appState.unassigned.indexOf(statId);
  if (idx >= 0) appState.unassigned.splice(idx, 1);
}

function setStatus(id, text, cls) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'status-text' + (cls ? ' ' + cls : '');
}

function getStatDef(statId) {
  return appState.statLookup[statId] || appState.statRegistry.find(s => s.stat === statId);
}
