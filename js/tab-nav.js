let activeTab = 'tree'; // 'tree', 'editor', or 'stats'
let activeEditorPath = 'north'; // which path subtab is shown
let _renderingEditor = false;

function switchTab(tab) {
  activeTab = tab;
  const treeContent = document.getElementById('treeViewContent');
  const editor = document.getElementById('areaEditor');
  const statsContent = document.getElementById('statsContent');
  const tabTree = document.getElementById('tabTree');
  const tabEditor = document.getElementById('tabEditor');
  const tabStats = document.getElementById('tabStats');

  treeContent.classList.add('hidden');
  editor.classList.remove('active');
  statsContent.classList.remove('active');
  tabTree.classList.remove('active');
  tabEditor.classList.remove('active');
  tabStats.classList.remove('active');

  if (tab === 'tree') {
    treeContent.classList.remove('hidden');
    tabTree.classList.add('active');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  } else if (tab === 'editor') {
    editor.classList.add('active');
    tabEditor.classList.add('active');
    renderEditorUnassigned();
    renderEditorAreas();
    renderEditorGlobalBucket();
  } else if (tab === 'stats') {
    statsContent.classList.add('active');
    tabStats.classList.add('active');
    renderStatsTab();
  }
}

function switchEditorPath(path) {
  activeEditorPath = path;
  // Update tab buttons
  document.querySelectorAll('#pathTabBar .path-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.path === path);
  });
  // Re-render the active path panel
  renderEditorAreas();
}

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'e' || e.key === 'E') {
    switchTab(activeTab === 'tree' ? 'editor' : 'tree');
  }
  if (e.key === 's' || e.key === 'S') {
    switchTab(activeTab === 'stats' ? 'tree' : 'stats');
  }
});

function toggleSection(id) {
  document.getElementById(id).classList.toggle('collapsed');
}
