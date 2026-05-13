let statsSort = 'alpha'; // 'alpha', 'value', 'path', 'tier'

function formatStatValue(rawValue, display) {
  if (!display) return String(rawValue);
  const multiplier = display.multiplier || 1;
  const displayVal = rawValue * multiplier;
  const fmt = display.format || '0.##';
  const prefix = display.prefix || '';
  const suffix = display.suffix || '';
  const formatted = formatNumber(displayVal, fmt);
  return `${prefix}${formatted}${suffix}`;
}

function formatNumber(value, fmt) {
  if (fmt === '0') return Math.round(value).toString();
  // Parse C# format strings like "0.##", "0.#"
  const match = fmt.match(/^0(\.([#0]+))?$/);
  if (!match) return value.toString();
  const pattern = match[2] || '';
  const maxDecimals = pattern.length;
  const minDecimals = (pattern.match(/0/g) || []).length;
  // Use toFixed for max precision, then trim trailing zeros down to minDecimals
  let result = value.toFixed(maxDecimals);
  if (maxDecimals > minDecimals) {
    const parts = result.split('.');
    if (parts[1]) {
      let decimals = parts[1];
      while (decimals.length > minDecimals && decimals.endsWith('0')) {
        decimals = decimals.slice(0, -1);
      }
      result = decimals.length > 0 ? `${parts[0]}.${decimals}` : parts[0];
    }
  }
  return result;
}

function computeStatSummaries() {
  const summaries = {};
  for (const def of appState.statRegistry) {
    summaries[def.stat] = {
      def,
      basicCount: 0,
      notableCount: 0,
      paths: new Set(),
      totalValue: 0,
      placements: [], // { entry, type } references into appState for editing
    };
  }

  // Count nodes from path areas
  for (const pn of ['north', 'south', 'east', 'west']) {
    const pathData = appState.paths[pn];
    for (const area of pathData.areas) {
      if (area.gate && summaries[area.gate]) {
        summaries[area.gate].paths.add(pn);
      }
      for (const entry of area.stats) {
        const s = summaries[entry.statId];
        if (!s) continue;
        s.paths.add(pn);
        s.placements.push(entry);
        const isNotable = s.def.node_tier === 'notable';
        if (isNotable) {
          s.notableCount += entry.count;
        } else {
          s.basicCount += entry.count;
        }
      }
    }
    // Path global stats
    for (const entry of pathData.global) {
      const s = summaries[entry.statId];
      if (!s) continue;
      s.paths.add(pn);
      s.placements.push(entry);
      const isNotable = s.def.node_tier === 'notable';
      if (isNotable) {
        s.notableCount += entry.count;
      } else {
        s.basicCount += entry.count;
      }
    }
  }

  // Global bucket stats
  for (const entry of appState.global) {
    const s = summaries[entry.statId];
    if (!s) continue;
    s.paths.add('global');
    s.placements.push(entry);
    const isNotable = s.def.node_tier === 'notable';
    if (isNotable) {
      s.notableCount += entry.count;
    } else {
      s.basicCount += entry.count;
    }
  }

  // Compute total values (each node has 1 level)
  const LEVELS_PER_NODE = { basic: 1, notable: 1, super_notable: 1 };
  for (const key of Object.keys(summaries)) {
    const s = summaries[key];
    const vpn = s.def.value_per_node;
    if (vpn) {
      const basicLevels = LEVELS_PER_NODE[s.def.node_tier === 'notable' ? 'notable' : 'basic'];
      const notableLevels = LEVELS_PER_NODE['notable'];
      s.totalValue = (s.basicCount * basicLevels * (vpn.basic || 0)) + (s.notableCount * notableLevels * (vpn.notable || 0));
    }
  }

  return Object.values(summaries);
}

function distributeNodeCount(placements, newTotal) {
  const oldTotal = placements.reduce((sum, p) => sum + p.count, 0);
  if (oldTotal === newTotal || placements.length === 0) return;

  const delta = newTotal - oldTotal;
  if (delta > 0) {
    // Add to the first placement
    placements[0].count += delta;
  } else {
    // Remove from placements, starting from the last
    let remaining = -delta;
    for (let i = placements.length - 1; i >= 0 && remaining > 0; i--) {
      const canRemove = placements[i].count - 1; // keep min 1
      const toRemove = Math.min(canRemove, remaining);
      placements[i].count -= toRemove;
      remaining -= toRemove;
    }
  }
}

const TIER_ORDER = { super_notable: 0, notable: 1, basic: 2 };

function setStatsSort(sort) {
  statsSort = sort;
  document.querySelectorAll('#statsToolbar .sort-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('sort' + sort.charAt(0).toUpperCase() + sort.slice(1)).classList.add('active');
  renderStatsTab();
}

function renderStatsTab() {
  const container = document.getElementById('statsListContainer');
  if (!container) return;

  if (appState.statRegistry.length === 0) {
    container.innerHTML = '<div class="stats-empty">Load a stat registry to see stats</div>';
    return;
  }

  const search = (document.getElementById('statsSearch')?.value || '').toLowerCase().trim();
  let stats = computeStatSummaries();

  // Filter by search
  if (search) {
    stats = stats.filter(s =>
      s.def.display_name.toLowerCase().includes(search) ||
      s.def.stat.toLowerCase().includes(search) ||
      (s.def.description || '').toLowerCase().includes(search)
    );
  }

  // Sort
  if (statsSort === 'alpha') {
    stats.sort((a, b) => a.def.display_name.localeCompare(b.def.display_name));
  } else if (statsSort === 'value') {
    stats.sort((a, b) => b.totalValue - a.totalValue || a.def.display_name.localeCompare(b.def.display_name));
  } else if (statsSort === 'path') {
    const pathOrder = { north: 0, south: 1, east: 2, west: 3, global: 4 };
    stats.sort((a, b) => {
      const aFirst = Math.min(...[...a.paths].map(p => pathOrder[p] ?? 99), 99);
      const bFirst = Math.min(...[...b.paths].map(p => pathOrder[p] ?? 99), 99);
      return aFirst - bFirst || a.def.display_name.localeCompare(b.def.display_name);
    });
  } else if (statsSort === 'tier') {
    stats.sort((a, b) => (TIER_ORDER[a.def.node_tier] ?? 3) - (TIER_ORDER[b.def.node_tier] ?? 3) || a.def.display_name.localeCompare(b.def.display_name));
  }

  if (stats.length === 0) {
    container.innerHTML = '<div class="stats-empty">No matching stats</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const s of stats) {
    const row = document.createElement('div');
    row.className = `stat-row tier-${s.def.node_tier}`;
    row.dataset.statId = s.def.stat;
    if (canvasState.highlightedStat === s.def.stat) {
      row.classList.add('stat-highlighted');
    }
    row.addEventListener('click', function(e) {
      // Don't trigger highlight when clicking count input
      if (e.target.tagName === 'INPUT') return;
      const statId = s.def.stat;
      canvasState.highlightedStat = (canvasState.highlightedStat === statId) ? null : statId;
      if (appState.lastResult) {
        renderCanvas(appState.lastResult);
        renderMinimap(appState.lastResult);
      }
      renderStatsTab();
    });

    const name = document.createElement('div');
    name.className = 'stat-name';
    name.textContent = s.def.display_name;
    row.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'stat-desc';
    desc.textContent = s.def.description || '';
    row.appendChild(desc);

    // Path badges
    const pathsDiv = document.createElement('div');
    pathsDiv.className = 'stat-paths';
    for (const p of ['north', 'south', 'east', 'west', 'global']) {
      if (s.paths.has(p)) {
        const badge = document.createElement('span');
        badge.className = `path-badge ${p}`;
        badge.textContent = p === 'global' ? 'G' : p.charAt(0).toUpperCase();
        pathsDiv.appendChild(badge);
      }
    }
    row.appendChild(pathsDiv);

    // Node count input
    if (s.def.node_tier !== 'super_notable' && s.placements.length > 0) {
      const totalNodes = s.basicCount + s.notableCount;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'stat-count-input';
      input.min = '1';
      input.value = totalNodes;
      const placements = s.placements;
      input.onchange = function() {
        const newTotal = Math.max(1, parseInt(this.value) || 1);
        this.value = newTotal;
        distributeNodeCount(placements, newTotal);
        autoSave();
        renderStatsTab();
      };
      row.appendChild(input);
    } else if (s.def.node_tier !== 'super_notable') {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'stat-count-input';
      input.disabled = true;
      input.value = 0;
      row.appendChild(input);
    } else {
      // Gate placeholder to keep alignment
      const spacer = document.createElement('div');
      spacer.style.width = '50px';
      spacer.style.flexShrink = '0';
      row.appendChild(spacer);
    }

    // Node counts label
    const counts = document.createElement('div');
    counts.className = 'stat-node-counts';
    if (s.def.node_tier === 'super_notable') {
      counts.textContent = s.paths.size > 0 ? 'Unlocked' : '-';
    } else {
      const parts = [];
      if (s.basicCount > 0) parts.push(`${s.basicCount}b`);
      if (s.notableCount > 0) parts.push(`${s.notableCount}n`);
      counts.textContent = parts.length > 0 ? parts.join(' + ') : '-';
    }
    row.appendChild(counts);

    // Per-node values
    const perNode = document.createElement('div');
    perNode.className = 'stat-per-node';
    if (s.def.value_per_node) {
      const vpn = s.def.value_per_node;
      const bStr = vpn.basic != null ? formatStatValue(vpn.basic, s.def.display) : '';
      const nStr = vpn.notable != null ? formatStatValue(vpn.notable, s.def.display) : '';
      const parts = [];
      if (bStr) parts.push(`b:${bStr}`);
      if (nStr) parts.push(`n:${nStr}`);
      perNode.textContent = parts.join(' / ');
    } else {
      perNode.textContent = s.def.node_tier === 'super_notable' ? 'Gate' : '';
    }
    row.appendChild(perNode);

    // Total value
    const total = document.createElement('div');
    total.className = 'stat-total';
    if (s.def.node_tier === 'super_notable') {
      total.textContent = s.paths.size > 0 ? 'Unlocked' : '';
      if (s.paths.size === 0) total.classList.add('zero');
    } else if (s.totalValue === 0) {
      total.textContent = formatStatValue(0, s.def.display);
      total.classList.add('zero');
    } else {
      const sign = s.def.apply_mode === 'subtract' ? '-' : '';
      total.textContent = sign + formatStatValue(s.totalValue, s.def.display);
    }
    row.appendChild(total);

    frag.appendChild(row);
  }

  container.innerHTML = '';
  container.appendChild(frag);
}
