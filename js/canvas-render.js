let canvasState = {
  panX: 0,
  panY: 0,
  zoom: 1,
  isPanning: false,
  lastMouseX: 0,
  lastMouseY: 0,
  hoveredNode: null,
  highlightedStat: null,
  _didPan: false,
};

function renderCanvas(result) {
  const canvas = document.getElementById('treeCanvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;

  const pathColors = {
    north: '#ff4444',
    south: '#4488ff',
    east: '#44cc44',
    west: '#ff8800',
    null: '#888888',
  };
  const tierRadius = { basic: 5, notable: 9, super_notable: 13 };

  // Find bounds
  const padding = 3;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const n of result.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const gridW = maxX - minX + padding * 2;
  const gridH = maxY - minY + padding * 2;
  const baseCellSize = Math.min(w / gridW, h / gridH, 40);
  const cellSize = baseCellSize * canvasState.zoom;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const offsetX = w / 2 - centerX * cellSize + canvasState.panX;
  const offsetY = h / 2 - centerY * cellSize + canvasState.panY;

  const toScreen = (x, y) => [offsetX + x * cellSize, offsetY + y * cellSize];

  // Clear
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, w, h);

  // Draw grid lines (subtle)
  ctx.strokeStyle = '#222240';
  ctx.lineWidth = 0.5;
  for (let gx = minX - padding; gx <= maxX + padding; gx++) {
    const [sx] = toScreen(gx, 0);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
  }
  for (let gy = minY - padding; gy <= maxY + padding; gy++) {
    const [, sy] = toScreen(0, gy);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
  }

  // Draw connections
  ctx.lineWidth = 2;
  const hl = canvasState.highlightedStat;
  let nodeLookup = null;
  if (hl) {
    nodeLookup = {};
    for (const n of result.nodes) nodeLookup[n.x + ',' + n.y] = n;
  }
  for (const c of result.connections) {
    const [x1, y1] = toScreen(c.from.x, c.from.y);
    const [x2, y2] = toScreen(c.to.x, c.to.y);
    if (hl && nodeLookup) {
      const fromNode = nodeLookup[c.from.x + ',' + c.from.y];
      const toNode = nodeLookup[c.to.x + ',' + c.to.y];
      const match = (fromNode && fromNode.stat === hl) || (toNode && toNode.stat === hl);
      ctx.strokeStyle = match ? '#888' : 'rgba(85,85,85,0.15)';
    } else {
      ctx.strokeStyle = '#555';
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Draw nodes
  const drawOrder = [
    result.nodes.filter(n => !n.isRoot),
    result.nodes.filter(n => n.isRoot),
  ];

  for (const layer of drawOrder) {
    for (const n of layer) {
      const [sx, sy] = toScreen(n.x, n.y);
      const color = pathColors[n._path] || pathColors['null'];
      const isHovered = canvasState.hoveredNode && canvasState.hoveredNode.id === n.id;
      const isHighlighted = !hl || n.stat === hl;

      if (n.isRoot) {
        ctx.fillStyle = '#ffdd00';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          const r = i % 2 === 0 ? 14 : 6;
          const method = i === 0 ? 'moveTo' : 'lineTo';
          ctx[method](sx + Math.cos(angle) * r, sy + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#aa8800';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        const tier = n.isSuperNotable ? 'super_notable' : n.isNotable ? 'notable' : 'basic';
        const r = tierRadius[tier];
        const dimmed = hl && !isHighlighted;

        if (dimmed) ctx.globalAlpha = 0.2;
        const fillColor = dimmed ? '#444' : (isHovered ? '#fff' : color);

        if (tier === 'super_notable') {
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = dimmed ? '#555' : '#ffd700';
          ctx.lineWidth = 3;
          ctx.stroke();
          if (!dimmed) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else if (tier === 'notable') {
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
          if (!dimmed) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (dimmed) ctx.globalAlpha = 1;

        // Label for non-basic nodes
        if (!dimmed && cellSize >= 20 && (tier === 'notable' || tier === 'super_notable')) {
          ctx.fillStyle = '#fff';
          ctx.font = '9px Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(n.name, sx, sy + r + 12);
        }
      }

      // Coordinate label (debug)
      if (!(hl && !isHighlighted) && cellSize >= 25) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '7px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${n.x},${n.y}`, sx, sy - (n.isRoot ? 16 : (tierRadius[n.isSuperNotable ? 'super_notable' : n.isNotable ? 'notable' : 'basic'] || 5) + 4));
      }
    }
  }

  // Draw legend in top-left corner
  const legendX = 14;
  let legendY = 20;
  ctx.font = 'bold 13px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ddd';
  ctx.fillText('Skill Tree Preview', legendX, legendY);
  legendY += 22;

  ctx.font = '11px Consolas, monospace';
  for (const [name, color] of Object.entries(pathColors)) {
    if (name === 'null') continue;
    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY - 8, 12, 12);
    ctx.fillStyle = '#ccc';
    ctx.fillText(name.charAt(0).toUpperCase() + name.slice(1), legendX + 18, legendY + 1);
    legendY += 16;
  }

  legendY += 6;
  const tiers = [
    { label: 'Basic', r: 5, border: false },
    { label: 'Notable', r: 9, border: true, borderColor: '#fff' },
    { label: 'Super Notable (Gate)', r: 13, border: true, borderColor: '#ffd700' },
  ];
  for (const t of tiers) {
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(legendX + 6, legendY, t.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    if (t.border) {
      ctx.strokeStyle = t.borderColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = '#ccc';
    ctx.fillText(t.label, legendX + 18, legendY + 4);
    legendY += 18;
  }

  // Root legend
  ctx.fillStyle = '#ffdd00';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI / 5) - Math.PI / 2;
    const r = i % 2 === 0 ? 7 : 3;
    const method = i === 0 ? 'moveTo' : 'lineTo';
    ctx[method](legendX + 6 + Math.cos(angle) * r, legendY + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ccc';
  ctx.fillText('Root', legendX + 18, legendY + 4);
}

// ---- Minimap ----
function renderMinimap(result) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 160 * dpr;
  canvas.height = 120 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pathColors = {
    north: '#ff4444', south: '#4488ff',
    east: '#44cc44', west: '#ff8800', null: '#888',
  };

  ctx.fillStyle = 'rgba(13,13,26,0.9)';
  ctx.fillRect(0, 0, 160, 120);

  if (!result || result.nodes.length === 0) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of result.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const pw = 2;
  const gw = maxX - minX + pw * 2;
  const gh = maxY - minY + pw * 2;
  const cs = Math.min(150 / gw, 110 / gh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ox = 80 - cx * cs;
  const oy = 60 - cy * cs;

  // Connections
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  for (const c of result.connections) {
    ctx.beginPath();
    ctx.moveTo(ox + c.from.x * cs, oy + c.from.y * cs);
    ctx.lineTo(ox + c.to.x * cs, oy + c.to.y * cs);
    ctx.stroke();
  }

  // Nodes
  for (const n of result.nodes) {
    const sx = ox + n.x * cs;
    const sy = oy + n.y * cs;
    if (n.isRoot) {
      ctx.fillStyle = '#ffd700';
    } else {
      ctx.fillStyle = pathColors[n._path] || '#888';
    }
    const r = n.isSuperNotable ? 3 : n.isNotable ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Viewport rectangle
  const mainCanvas = document.getElementById('treeCanvas');
  const mainRect = mainCanvas.parentElement.getBoundingClientRect();
  const mw = mainRect.width;
  const mh = mainRect.height;
  const mainGridW = maxX - minX + 6;
  const mainGridH = maxY - minY + 6;
  const mainBaseCellSize = Math.min(mw / mainGridW, mh / mainGridH, 40);
  const mainCellSize = mainBaseCellSize * canvasState.zoom;
  const mainCX = (minX + maxX) / 2;
  const mainCY = (minY + maxY) / 2;
  const mainOffX = mw / 2 - mainCX * mainCellSize + canvasState.panX;
  const mainOffY = mh / 2 - mainCY * mainCellSize + canvasState.panY;
  // Convert viewport corners to grid coords, then to minimap coords
  const gridLeftTop = { x: (0 - mainOffX) / mainCellSize, y: (0 - mainOffY) / mainCellSize };
  const gridRightBot = { x: (mw - mainOffX) / mainCellSize, y: (mh - mainOffY) / mainCellSize };
  const vpx1 = ox + gridLeftTop.x * cs;
  const vpy1 = oy + gridLeftTop.y * cs;
  const vpx2 = ox + gridRightBot.x * cs;
  const vpy2 = oy + gridRightBot.y * cs;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpx1, vpy1, vpx2 - vpx1, vpy2 - vpy1);
}

// ---- Canvas Interaction (pan, zoom, tooltip) ----
(function() {
  const mainArea = document.getElementById('mainArea');
  const canvas = document.getElementById('treeCanvas');
  const tooltip = document.getElementById('tooltip');

  // Pan
  canvas.addEventListener('mousedown', function(e) {
    if (e.button === 0 || e.button === 1) {
      canvasState.isPanning = true;
      canvasState.lastMouseX = e.clientX;
      canvasState.lastMouseY = e.clientY;
      canvas.style.cursor = 'grabbing';
      canvasState._didPan = false;
    }
  });
  window.addEventListener('mousemove', function(e) {
    if (canvasState.isPanning) {
      canvasState.panX += e.clientX - canvasState.lastMouseX;
      canvasState.panY += e.clientY - canvasState.lastMouseY;
      canvasState.lastMouseX = e.clientX;
      canvasState.lastMouseY = e.clientY;
      canvasState._didPan = true;
      if (appState.lastResult) {
        renderCanvas(appState.lastResult);
        renderMinimap(appState.lastResult);
      }
    } else {
      // Tooltip hover (rAF throttled)
      if (!canvasState._hoverRAF) {
        canvasState._hoverRAF = requestAnimationFrame(() => {
          canvasState._hoverRAF = null;
          handleCanvasHover(e);
        });
      }
    }
  });
  window.addEventListener('mouseup', function() {
    if (canvasState.isPanning) {
      canvasState.isPanning = false;
      canvas.style.cursor = 'crosshair';
    }
  });

  // Stat highlight on click
  canvas.addEventListener('click', function(e) {
    if (canvasState._didPan) return;
    if (!appState.lastResult) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const result = appState.lastResult;

    // Same coordinate transform as handleCanvasHover
    const padding = 3;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const n of result.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const w = rect.width, h = rect.height;
    const gridW = maxX - minX + padding * 2;
    const gridH = maxY - minY + padding * 2;
    const baseCellSize = Math.min(w / gridW, h / gridH, 40);
    const cellSize = baseCellSize * canvasState.zoom;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const offsetX = w / 2 - centerX * cellSize + canvasState.panX;
    const offsetY = h / 2 - centerY * cellSize + canvasState.panY;
    const tierRadius = { basic: 5, notable: 9, super_notable: 13 };

    let closest = null;
    let closestDist = Infinity;
    for (const n of result.nodes) {
      if (n.isRoot) continue;
      const sx = offsetX + n.x * cellSize;
      const sy = offsetY + n.y * cellSize;
      const tier = n.isSuperNotable ? 'super_notable' : n.isNotable ? 'notable' : 'basic';
      const r = tierRadius[tier];
      const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
      if (dist < r + 6 && dist < closestDist) {
        closest = n;
        closestDist = dist;
      }
    }

    if (closest && closest.stat) {
      canvasState.highlightedStat = (canvasState.highlightedStat === closest.stat) ? null : closest.stat;
    } else {
      canvasState.highlightedStat = null;
    }

    renderCanvas(result);
    renderMinimap(result);
    renderStatsTab();
  });

  // Escape clears stat highlight
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && canvasState.highlightedStat) {
      canvasState.highlightedStat = null;
      if (appState.lastResult) {
        renderCanvas(appState.lastResult);
        renderMinimap(appState.lastResult);
      }
      renderStatsTab();
    }
  });

  // Zoom
  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.2, Math.min(5, canvasState.zoom * delta));

    // Zoom towards mouse position
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    canvasState.panX = mx - (mx - canvasState.panX) * (newZoom / canvasState.zoom);
    canvasState.panY = my - (my - canvasState.panY) * (newZoom / canvasState.zoom);
    canvasState.zoom = newZoom;

    if (appState.lastResult) {
      renderCanvas(appState.lastResult);
      renderMinimap(appState.lastResult);
    }
  }, { passive: false });

  // Tooltip on hover
  function handleCanvasHover(e) {
    if (!appState.lastResult) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const result = appState.lastResult;
    // Compute transform (same as renderCanvas)
    const padding = 3;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const n of result.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const w = rect.width;
    const h = rect.height;
    const gridW = maxX - minX + padding * 2;
    const gridH = maxY - minY + padding * 2;
    const baseCellSize = Math.min(w / gridW, h / gridH, 40);
    const cellSize = baseCellSize * canvasState.zoom;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const offsetX = w / 2 - centerX * cellSize + canvasState.panX;
    const offsetY = h / 2 - centerY * cellSize + canvasState.panY;

    const tierRadius = { basic: 5, notable: 9, super_notable: 13 };

    // Find closest node
    let closest = null;
    let closestDist = Infinity;
    for (const n of result.nodes) {
      const sx = offsetX + n.x * cellSize;
      const sy = offsetY + n.y * cellSize;
      const tier = n.isSuperNotable ? 'super_notable' : n.isNotable ? 'notable' : 'basic';
      const r = n.isRoot ? 14 : tierRadius[tier];
      const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
      if (dist < r + 6 && dist < closestDist) {
        closest = n;
        closestDist = dist;
      }
    }

    if (closest && closest !== canvasState.hoveredNode) {
      canvasState.hoveredNode = closest;
      tooltip.style.display = 'block';
      tooltip.querySelector('.tt-name').textContent = closest.name;
      tooltip.querySelector('.tt-id').textContent = closest.id;
      tooltip.querySelector('.tt-stat').textContent = closest.stat || '(root)';
      tooltip.querySelector('.tt-desc').textContent = closest.description;
      tooltip.querySelector('.tt-levels').textContent = `Levels: ${closest.levels}`;

      // Position tooltip
      let tx = e.clientX + 12;
      let ty = e.clientY - 10;
      if (tx + 220 > window.innerWidth) tx = e.clientX - 230;
      if (ty + 100 > window.innerHeight) ty = e.clientY - 100;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';

      renderCanvas(result);
    } else if (!closest && canvasState.hoveredNode) {
      canvasState.hoveredNode = null;
      tooltip.style.display = 'none';
      renderCanvas(result);
    } else if (closest) {
      // Update tooltip position
      let tx = e.clientX + 12;
      let ty = e.clientY - 10;
      if (tx + 220 > window.innerWidth) tx = e.clientX - 230;
      if (ty + 100 > window.innerHeight) ty = e.clientY - 100;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
    }
  }
})();

// ---- Window Resize (debounced) ----
let _resizeTimer = null;
window.addEventListener('resize', function() {
  if (_resizeTimer) clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(function() {
    if (appState.lastResult) {
      renderCanvas(appState.lastResult);
      renderMinimap(appState.lastResult);
    } else {
      // Re-render empty placeholder on resize
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
      ctx.fillStyle = '#444';
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Load a stat registry and assign stats, then click Generate Tree', rect.width / 2, rect.height / 2);
    }
  }, 100);
});
