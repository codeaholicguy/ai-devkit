import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { memoryStoreCommand } from '@ai-devkit/memory';
import { startDashboardServer } from '../src/server';

describe('dashboard server', () => {
  const testDbPath = join(tmpdir(), `test-dashboard-server-${Date.now()}-${Math.random().toString(36)}.db`);

  afterEach(() => {
    rmSync(testDbPath, { force: true });
    rmSync(`${testDbPath}-wal`, { force: true });
    rmSync(`${testDbPath}-shm`, { force: true });
  });

  function seedDashboardRecords(): void {
    memoryStoreCommand({
      dbPath: testDbPath,
      title: 'Dashboard server route memory',
      content: 'The memory dashboard server should expose JSON APIs backed by the configured memory database.',
      tags: 'dashboard,server',
      scope: 'project:ai-devkit',
    });

    for (let index = 0; index < 55; index += 1) {
      memoryStoreCommand({
        dbPath: testDbPath,
        title: `Dashboard complete list memory ${index}`,
        content: `The dashboard memory list should return a bounded page while preserving the total matching count. Fixture row ${index}.`,
        tags: 'dashboard,server',
        scope: 'project:ai-devkit',
      });
    }
  }

  it('serves dashboard HTML and static assets', async () => {
    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const html = await fetch(`${server.url}/`);
      expect(html.status).toBe(200);
      const htmlText = await html.text();
      expect(htmlText).toContain('AI DevKit Memory');
      expect(htmlText).toContain('id="memory-search"');
      expect(htmlText).toContain('id="scope-filter"');
      expect(htmlText).toContain('id="tag-filter"');
      expect(htmlText).toContain('id="memory-list"');
      expect(htmlText).toContain('id="memory-pagination"');
      expect(htmlText).toContain('id="memory-detail"');
      expect(htmlText).toContain('id="memory-graph"');
      expect(htmlText).toContain('id="graph-selected-title"');
      expect(htmlText).toContain('id="graph-zoom-out"');
      expect(htmlText).toContain('id="graph-zoom-in"');
      expect(htmlText).toContain('id="graph-fit"');
      expect(htmlText).toContain('id="graph-layout"');
      expect(htmlText).toContain('/assets/app.js');
      expect(htmlText).toContain('/assets/styles.css');

      const css = await fetch(`${server.url}/assets/styles.css`);
      expect(css.status).toBe(200);
      const cssSource = await css.text();
      expect(cssSource).toContain('tailwindcss');
      expect(cssSource).toContain('.graph-canvas');
      expect(cssSource).toContain('.memory-pagination');

      const app = await fetch(`${server.url}/assets/app.js`);
      expect(app.status).toBe(200);
      const appSource = await app.text();
      expect(appSource).toContain('/api/memory');
      expect(appSource).toContain('/api/summary');
      expect(appSource).toContain('/api/graph');
      expect(appSource).toContain('cytoscape');
      expect(appSource).toContain('URLSearchParams');
      expect(appSource).toContain('history.replaceState');
      expect(appSource).toContain('renderMemoryList');
      expect(appSource).toContain('renderPagination');
      expect(appSource).toContain('renderMemoryGraph');
      expect(appSource).toContain('zoomGraphBy');
      expect(appSource).toContain('fitGraphTo');
      expect(appSource).toContain('graph-selected-title');

      const vendor = await fetch(`${server.url}/assets/vendor/cytoscape.esm.min.mjs`);
      expect(vendor.status).toBe(200);
      await expect(vendor.text()).resolves.toContain('cytoscape');
    } finally {
      await server.close();
    }
  });

  it('returns paginated memory and summary APIs', async () => {
    seedDashboardRecords();

    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const memory = await fetch(`${server.url}/api/memory?query=dashboard&scope=project:ai-devkit&tag=server`);
      const memoryBody = await memory.json();
      expect(memory.status).toBe(200);
      expect(memoryBody.total).toBe(56);
      expect(memoryBody.items).toHaveLength(50);
      expect(memoryBody.items[0]).toEqual(expect.objectContaining({
        tags: ['dashboard', 'server'],
        scope: 'project:ai-devkit',
      }));

      const summary = await fetch(`${server.url}/api/summary`);
      expect(summary.status).toBe(200);
      await expect(summary.json()).resolves.toMatchObject({
        totalItems: 56,
        scopes: [{ scope: 'project:ai-devkit', count: 56 }],
      });

      const sorted = await fetch(`${server.url}/api/memory?sort=title-asc&limit=1`);
      const sortedBody = await sorted.json();
      expect(sorted.status).toBe(200);
      expect(sortedBody.items[0].title).toBe('Dashboard complete list memory 0');
    } finally {
      await server.close();
    }
  });

  it('returns JSON errors for unsupported methods and routes', async () => {
    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const method = await fetch(`${server.url}/api/memory`, { method: 'POST' });
      expect(method.status).toBe(405);
      await expect(method.json()).resolves.toMatchObject({
        error: 'Method not allowed',
      });

      const missing = await fetch(`${server.url}/not-found`);
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toMatchObject({
        error: 'Not found',
      });
    } finally {
      await server.close();
    }
  });

  it('returns JSON errors for invalid query parameters', async () => {
    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const response = await fetch(`${server.url}/api/memory?limit=invalid`);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Invalid request',
      });

      const sortResponse = await fetch(`${server.url}/api/graph?sort=unknown`);
      expect(sortResponse.status).toBe(400);
      await expect(sortResponse.json()).resolves.toMatchObject({
        error: 'Invalid request',
        message: 'sort must be updated-desc, created-desc, or title-asc.',
      });
    } finally {
      await server.close();
    }
  });

  it('returns empty memory, summary, and graph data for a missing database path', async () => {
    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const memory = await fetch(`${server.url}/api/memory`);
      expect(memory.status).toBe(200);
      await expect(memory.json()).resolves.toMatchObject({
        total: 0,
        items: [],
      });

      const summary = await fetch(`${server.url}/api/summary`);
      expect(summary.status).toBe(200);
      await expect(summary.json()).resolves.toMatchObject({
        totalItems: 0,
        scopes: [],
        tags: [],
      });

      const graph = await fetch(`${server.url}/api/graph`);
      expect(graph.status).toBe(200);
      await expect(graph.json()).resolves.toMatchObject({
        nodes: [],
        edges: [],
      });
    } finally {
      await server.close();
    }
  });

  it('handles favicon requests without a console-visible 404', async () => {
    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const response = await fetch(`${server.url}/favicon.ico`);
      expect(response.status).toBe(204);
    } finally {
      await server.close();
    }
  });

  it('returns graph nodes and edges from filtered memory records', async () => {
    memoryStoreCommand({
      dbPath: testDbPath,
      title: 'Graph dashboard relationship memory',
      content: 'Graph data should connect memory records to their tags and scopes for the dashboard.',
      tags: 'graph,dashboard',
      scope: 'project:ai-devkit',
    });

    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const response = await fetch(`${server.url}/api/graph?query=graph&tag=dashboard`);
      expect(response.status).toBe(200);
      const graph = await response.json();

      expect(graph.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^memory:/),
          type: 'memory',
          label: 'Graph dashboard relationship memory',
          item: expect.objectContaining({
            title: 'Graph dashboard relationship memory',
            content: 'Graph data should connect memory records to their tags and scopes for the dashboard.',
          }),
        }),
        { id: 'tag:dashboard', type: 'tag', label: 'dashboard', count: 1 },
        { id: 'tag:graph', type: 'tag', label: 'graph', count: 1 },
        { id: 'scope:project:ai-devkit', type: 'scope', label: 'project:ai-devkit', count: 1 },
      ]));
      expect(graph.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'has-tag', target: 'tag:dashboard' }),
        expect.objectContaining({ type: 'in-scope', target: 'scope:project:ai-devkit' }),
      ]));
    } finally {
      await server.close();
    }
  });

  it('uses a 250 item default graph limit', async () => {
    for (let index = 0; index < 120; index += 1) {
      memoryStoreCommand({
        dbPath: testDbPath,
        title: `Graph limit dashboard memory ${index}`,
        content: `Graph default limit should include more than one hundred records. Fixture row ${index}.`,
        tags: 'graph-limit',
        scope: 'project:ai-devkit',
      });
    }

    const server = await startDashboardServer({
      dbPath: testDbPath,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      const response = await fetch(`${server.url}/api/graph?tag=graph-limit`);
      expect(response.status).toBe(200);
      const graph = await response.json();
      const memoryNodes = graph.nodes.filter((node: { type: string }) => node.type === 'memory');

      expect(memoryNodes).toHaveLength(120);
    } finally {
      await server.close();
    }
  });
});
