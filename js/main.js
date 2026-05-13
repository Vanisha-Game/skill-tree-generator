// ---- Initialize ----
window.addEventListener('load', function() {
  // Render empty canvas placeholder
  const canvas = document.getElementById('treeCanvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Try restoring from localStorage
  const restored = autoLoad();

  if (!restored) {
    ctx.fillStyle = '#444';
    ctx.font = '14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Load a stat registry and assign stats, then click Generate Tree', rect.width / 2, rect.height / 2);

    renderUnassigned();
    renderAllAreas();
    renderGlobalBucket();
  }

  // If after restore we still have no registry, try autoloading the example.
  // Mirrors the state setup done by the file-picker handler in persistence.js
  // (statRegistry + statLookup + unassigned), minus the localStorage-config replay
  // (autoLoad already ran above).
  if (appState.statRegistry.length === 0) {
    fetch('./stat-registry.json')
      .then(r => {
        if (!r.ok) throw new Error('fetch failed: ' + r.status);
        return r.json();
      })
      .then(data => {
        const stats = data.stats || data;
        if (!Array.isArray(stats) || stats.length === 0) throw new Error('invalid registry shape');
        appState.statRegistry = stats;
        appState.statLookup = {};
        for (const s of stats) appState.statLookup[s.stat] = s;
        appState.unassigned = stats.map(s => s.stat);
        // Chain a fetch for the default skill-tree-config.json so the Area Editor
        // shows pre-populated areas on first launch. If the file is missing, the
        // example registry alone is still usable.
        return fetch('./skill-tree-config.json')
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
          .then(cfg => {
            if (cfg) {
              try { loadConfig(cfg); } catch (e) { console.warn('default config load failed:', e.message); }
            }
            const statusEl = document.getElementById('fileStatus');
            if (statusEl) statusEl.textContent = `Loaded example registry (${stats.length} stats)` + (cfg ? ' + default config' : '');
            renderUnassigned();
            renderAllAreas();
            renderGlobalBucket();
            if (typeof renderEditorUnassigned === 'function') renderEditorUnassigned();
            if (typeof renderEditorAreas === 'function') renderEditorAreas();
            if (typeof renderEditorGlobalBucket === 'function') renderEditorGlobalBucket();
          });
      })
      .catch(err => {
        console.warn('autoload skipped:', err.message);
        const statusEl = document.getElementById('fileStatus');
        if (statusEl) {
          statusEl.textContent = 'Tip: serve over HTTP (e.g., python -m http.server) to auto-load the example registry, or use "Select stat-registry.json" below.';
        }
      });
  }
});
