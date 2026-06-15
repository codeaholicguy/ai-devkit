import cytoscape from '/assets/vendor/cytoscape.esm.min.mjs';

const elements = {
  search: document.getElementById('memory-search'),
  scope: document.getElementById('scope-filter'),
  tag: document.getElementById('tag-filter'),
  group: document.getElementById('group-mode'),
  summary: document.getElementById('summary-panel'),
  list: document.getElementById('memory-list'),
  pagination: document.getElementById('memory-pagination'),
  detail: document.getElementById('memory-detail'),
  graph: document.getElementById('memory-graph'),
  graphSelectedTitle: document.getElementById('graph-selected-title'),
  graphFit: document.getElementById('graph-fit'),
  graphLayout: document.getElementById('graph-layout'),
  graphZoomIn: document.getElementById('graph-zoom-in'),
  graphZoomOut: document.getElementById('graph-zoom-out'),
};

const PAGE_SIZE = 4;
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
});
let state = readStateFromUrl();
let currentItems = [];
let currentTotal = 0;
let selectedId = null;
let selectedDetailItem = null;
let graphInstance = null;
let latestGraphElements = [];

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get('query') || '',
    scope: params.get('scope') || '',
    tag: params.get('tag') || '',
    group: params.get('group') || 'scope',
    page: Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1),
  };
}

function applyStateToControls() {
  if (elements.search) elements.search.value = state.query;
  if (elements.scope) elements.scope.value = state.scope;
  if (elements.tag) elements.tag.value = state.tag;
  if (elements.group) elements.group.value = state.group;
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (state.query) params.set('query', state.query);
  if (state.scope) params.set('scope', state.scope);
  if (state.tag) params.set('tag', state.tag);
  if (state.group && state.group !== 'scope') params.set('group', state.group);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

function buildApiParams() {
  const params = new URLSearchParams();
  if (state.query) params.set('query', state.query);
  if (state.scope) params.set('scope', state.scope);
  if (state.tag) params.append('tag', state.tag);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String((state.page - 1) * PAGE_SIZE));
  return params;
}

function buildApiSuffix(params) {
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function loadDashboard() {
  updateUrlState();
  const params = buildApiParams();
  const { summary, memory, graph } = await fetchDashboardData(params);

  currentItems = memory.items || [];
  currentTotal = memory.total || currentItems.length;
  syncSelectedMemory();

  renderFacets(summary);
  renderSummary(summary);
  renderMemoryList(currentItems);
  renderPagination();
  renderDetail(selectedDetailItem);
  renderMemoryGraph(graph);
}

async function fetchDashboardData(params) {
  const suffix = buildApiSuffix(params);
  const [summaryResponse, memoryResponse, graphResponse] = await Promise.all([
    fetch('/api/summary'),
    fetch(`/api/memory${suffix}`),
    fetch(`/api/graph${suffix}`),
  ]);

  const [summary, memory, graph] = await Promise.all([
    summaryResponse.json(),
    memoryResponse.json(),
    graphResponse.json(),
  ]);

  return { summary, memory, graph };
}

function findCurrentItem(id) {
  return currentItems.find(item => item.id === id) || null;
}

function resolveSelectedItem(fallbackItem = null) {
  return selectedId ? findCurrentItem(selectedId) || fallbackItem : fallbackItem;
}

function syncSelectedMemory() {
  const currentSelection = resolveSelectedItem(selectedDetailItem);
  if (currentSelection) {
    selectedId = currentSelection.id;
    selectedDetailItem = currentSelection;
    return;
  }

  selectedId = currentItems[0]?.id || null;
  selectedDetailItem = currentItems[0] || null;
}

function renderFacets(summary) {
  replaceOptions(elements.scope, 'All scopes', (summary.scopes || []).map(item => item.scope));
  replaceOptions(elements.tag, 'All tags', (summary.tags || []).map(item => item.tag));
  applyStateToControls();
}

function replaceOptions(select, emptyLabel, values) {
  if (!select) return;
  const selected = select.value;
  select.textContent = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = emptyLabel;
  select.append(empty);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  select.value = values.includes(selected) ? selected : '';
}

function renderSummary(summary) {
  if (!elements.summary) return;
  elements.summary.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'summary-grid';
  grid.append(createStat('Total', summary.totalItems || 0));
  grid.append(createStat('Scopes', (summary.scopes || []).length));
  grid.append(createStat('Tags', (summary.tags || []).length));
  elements.summary.append(grid);
}

function createStat(label, value) {
  const stat = document.createElement('div');
  stat.className = 'summary-stat';
  const strong = document.createElement('strong');
  strong.className = 'block text-lg font-bold text-slate-950';
  strong.textContent = String(value);
  const span = document.createElement('div');
  span.className = 'muted';
  span.textContent = label;
  stat.append(strong, span);
  return stat;
}

function renderMemoryList(items) {
  if (!elements.list) return;
  elements.list.textContent = '';
  if (items.length === 0) {
    elements.list.textContent = 'No memory records match the current filters.';
    renderDetail(null);
    return;
  }

  const groups = groupItems(items, state.group);
  for (const [groupName, groupItemsForName] of groups) {
    const heading = document.createElement('h2');
    heading.className = 'memory-group-heading';
    heading.textContent = groupName;
    elements.list.append(heading);

    for (const item of groupItemsForName) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'memory-row';
      button.setAttribute('aria-selected', String(item.id === selectedId));
      button.setAttribute('aria-label', `Inspect ${item.title}`);
      button.addEventListener('click', () => selectMemory(item.id, item));

      const title = document.createElement('span');
      title.className = 'memory-title';
      title.textContent = item.title;
      const meta = document.createElement('span');
      meta.className = 'muted';
      meta.textContent = `${item.scope} • ${formatDate(item.updatedAt)}`;
      const tags = document.createElement('span');
      tags.className = 'tag-list';
      tags.textContent = (item.tags || []).join(', ');
      button.append(title, meta, tags);
      elements.list.append(button);
    }
  }
}

function renderPagination() {
  if (!elements.pagination) return;
  elements.pagination.textContent = '';
  const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));
  const page = Math.min(state.page, totalPages);
  state.page = page;

  const label = document.createElement('div');
  label.className = 'text-xs font-semibold text-slate-700';
  const start = currentTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, currentTotal);
  label.textContent = `${start}-${end} of ${currentTotal}`;

  const controls = document.createElement('div');
  controls.className = 'flex items-center gap-2';
  const previous = createPagerButton('Previous', page <= 1, () => {
    state.page = Math.max(1, state.page - 1);
    void loadDashboard();
  });
  const current = document.createElement('span');
  current.className = 'text-xs font-semibold text-slate-500';
  current.textContent = `Page ${page} / ${totalPages}`;
  const next = createPagerButton('Next', page >= totalPages, () => {
    state.page = Math.min(totalPages, state.page + 1);
    void loadDashboard();
  });
  controls.append(previous, current, next);
  elements.pagination.append(label, controls);
}

function createPagerButton(label, disabled, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pager-button';
  button.textContent = label;
  button.disabled = disabled;
  button.setAttribute('aria-label', `${label} memory page`);
  button.addEventListener('click', onClick);
  return button;
}

function groupItems(items, mode) {
  const groups = new Map();
  for (const item of items) {
    const keys = mode === 'tag'
      ? (item.tags.length ? item.tags : ['untagged'])
      : [mode === 'recency' ? recencyBucket(item.updatedAt) : item.scope];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function selectMemory(id, fallbackItem) {
  selectedId = id;
  selectedDetailItem = resolveSelectedItem(fallbackItem || null);
  renderDetail(selectedDetailItem);
  renderMemoryList(currentItems);
  highlightGraphSelection();
}

function renderDetail(item) {
  if (!elements.detail) return;
  elements.detail.textContent = '';
  if (!item) {
    elements.detail.textContent = 'Select a memory item to inspect details.';
    updateGraphSelectedTitle(null);
    return;
  }
  const eyebrow = document.createElement('p');
  eyebrow.className = 'text-xs font-bold uppercase text-slate-500';
  eyebrow.textContent = 'Selected Memory';
  const title = document.createElement('h2');
  title.className = 'detail-title mt-2';
  title.textContent = item.title;
  const meta = document.createElement('p');
  meta.className = 'muted mt-3';
  meta.textContent = `${item.scope} • Updated ${formatDate(item.updatedAt)}`;
  const content = document.createElement('p');
  content.className = 'mt-4 text-sm leading-6 text-slate-800';
  content.textContent = item.content;
  const tags = document.createElement('p');
  tags.className = 'tag-list mt-4';
  tags.textContent = (item.tags || []).join(', ');
  elements.detail.append(eyebrow, title, meta, content, tags);
  updateGraphSelectedTitle(item.title);
}

function renderMemoryGraph(graph) {
  if (!elements.graph) return;
  latestGraphElements = toCytoscapeElements(graph);

  if (!graphInstance) {
    graphInstance = cytoscape({
      container: elements.graph,
      elements: [],
      minZoom: 0.08,
      maxZoom: 4,
      style: graphStyle(),
      layout: { name: 'preset' },
    });
    graphInstance.on('tap', 'node', event => handleGraphNodeTap(event.target));
    graphInstance.on('mouseover', 'node', event => event.target.addClass('hovered'));
    graphInstance.on('mouseout', 'node', event => event.target.removeClass('hovered'));
    graphInstance.add(latestGraphElements);
    elements.graph.__memoryDashboardGraph = graphInstance;
    runGraphLayout();
  } else {
    graphInstance.elements().remove();
    graphInstance.add(latestGraphElements);
    elements.graph.__memoryDashboardGraph = graphInstance;
    runGraphLayout();
  }

  highlightGraphSelection();
}

function toCytoscapeElements(graph) {
  const nodes = (graph.nodes || []).map(node => ({
    data: {
      id: node.id,
      label: node.label,
      type: node.type,
      count: node.count || 1,
      item: node.item || null,
      memoryId: node.type === 'memory' ? node.id.replace(/^memory:/, '') : '',
    },
    classes: node.type,
  }));
  const edges = (graph.edges || []).map((edge, index) => ({
    data: {
      id: `edge:${index}:${edge.source}:${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: edge.type,
    },
    classes: edge.type,
  }));
  return [...nodes, ...edges];
}

function graphStyle() {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'font-size': 11,
        'font-weight': 700,
        color: '#0f172a',
        'text-max-width': 104,
        'text-wrap': 'ellipsis',
        'text-valign': 'bottom',
        'text-margin-y': 8,
        width: 'mapData(count, 1, 8, 28, 52)',
        height: 'mapData(count, 1, 8, 28, 52)',
        'border-width': 2,
        'border-color': '#ffffff',
      },
    },
    {
      selector: 'node.memory',
      style: {
        shape: 'round-rectangle',
        width: 44,
        height: 30,
        'background-color': '#2563eb',
        color: '#1e3a8a',
      },
    },
    {
      selector: 'node.tag',
      style: {
        shape: 'ellipse',
        'background-color': '#14b8a6',
        color: '#0f766e',
      },
    },
    {
      selector: 'node.scope',
      style: {
        shape: 'diamond',
        'background-color': '#f59e0b',
        color: '#92400e',
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'curve-style': 'bezier',
        'line-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#94a3b8',
        opacity: 0.72,
      },
    },
    {
      selector: '.selected',
      style: {
        'border-color': '#1d4ed8',
        'border-width': 4,
        'background-blacken': -0.12,
        'z-index': 20,
      },
    },
    {
      selector: '.connected',
      style: {
        opacity: 1,
        'line-color': '#2563eb',
        'target-arrow-color': '#2563eb',
        'z-index': 10,
      },
    },
    {
      selector: '.dimmed',
      style: {
        opacity: 0.28,
      },
    },
    {
      selector: '.hovered',
      style: {
        'border-color': '#0f172a',
      },
    },
  ];
}

function graphLayout() {
  return {
    name: 'cose',
    animate: false,
    fit: true,
    padding: 56,
    avoidOverlap: true,
    nodeRepulsion: 12000,
    idealEdgeLength: 96,
    edgeElasticity: 80,
    nestingFactor: 1.05,
    numIter: 1400,
  };
}

function runGraphLayout() {
  if (!graphInstance) return;
  const layout = graphInstance.layout(graphLayout());
  layout.one('layoutstop', () => {
    fitGraphTo();
  });
  layout.run();
}

function fitGraphTo(elementsToFit) {
  if (!graphInstance) return;
  graphInstance.resize();
  graphInstance.fit(elementsToFit, 56);
}

function zoomGraphBy(factor) {
  if (!graphInstance || !elements.graph) return;
  const nextZoom = Math.max(
    graphInstance.minZoom(),
    Math.min(graphInstance.maxZoom(), graphInstance.zoom() * factor)
  );
  graphInstance.zoom({
    level: nextZoom,
    renderedPosition: {
      x: elements.graph.clientWidth / 2,
      y: elements.graph.clientHeight / 2,
    },
  });
}

function handleGraphNodeTap(node) {
  const type = node.data('type');
  if (type === 'memory') {
    selectMemory(node.data('memoryId'), node.data('item'));
    return;
  }

  updateGraphSelectedTitle(`${type}: ${node.data('label')}`);
  graphInstance.elements().removeClass('selected connected dimmed');
  node.addClass('selected');
  graphInstance.elements().difference(node.closedNeighborhood()).addClass('dimmed');
  node.connectedEdges().addClass('connected');
  fitGraphTo(node.closedNeighborhood());
}

function highlightGraphSelection() {
  if (!graphInstance) return;
  graphInstance.elements().removeClass('selected connected dimmed');
  if (!selectedId) return;

  const node = graphInstance.getElementById(`memory:${selectedId}`);
  if (!node || node.empty()) return;

  node.addClass('selected');
  node.connectedEdges().addClass('connected');
  node.neighborhood('node').addClass('connected');
  graphInstance.elements().difference(node.closedNeighborhood()).addClass('dimmed');
  fitGraphTo(node.closedNeighborhood());
}

function updateGraphSelectedTitle(value) {
  if (elements.graphSelectedTitle) {
    elements.graphSelectedTitle.textContent = value || 'Select a graph node or memory row';
  }
}

function recencyBucket(value) {
  const age = Date.now() - Date.parse(value);
  const day = 24 * 60 * 60 * 1000;
  if (Number.isNaN(age)) return 'older';
  if (age <= day) return 'today';
  if (age <= 7 * day) return 'week';
  if (age <= 30 * day) return 'month';
  return 'older';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function bindControls() {
  const onChange = () => {
    state = {
      query: elements.search ? elements.search.value.trim() : '',
      scope: elements.scope ? elements.scope.value : '',
      tag: elements.tag ? elements.tag.value : '',
      group: elements.group ? elements.group.value : 'scope',
      page: 1,
    };
    void loadDashboard();
  };
  elements.search && elements.search.addEventListener('input', onChange);
  elements.scope && elements.scope.addEventListener('change', onChange);
  elements.tag && elements.tag.addEventListener('change', onChange);
  elements.group && elements.group.addEventListener('change', onChange);
  elements.graphFit && elements.graphFit.addEventListener('click', () => fitGraphTo());
  elements.graphLayout && elements.graphLayout.addEventListener('click', runGraphLayout);
  elements.graphZoomIn && elements.graphZoomIn.addEventListener('click', () => zoomGraphBy(1.25));
  elements.graphZoomOut && elements.graphZoomOut.addEventListener('click', () => zoomGraphBy(0.8));
  elements.graph && elements.graph.addEventListener('keydown', handleGraphKeyDown);
  window.addEventListener('resize', () => fitGraphTo());
}

function handleGraphKeyDown(event) {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomGraphBy(1.25);
    return;
  }

  if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    zoomGraphBy(0.8);
    return;
  }

  if (event.key === '0' || event.key.toLowerCase() === 'f') {
    event.preventDefault();
    fitGraphTo();
    return;
  }

  if (event.key.toLowerCase() === 'l') {
    event.preventDefault();
    runGraphLayout();
  }
}

applyStateToControls();
bindControls();
void loadDashboard();
