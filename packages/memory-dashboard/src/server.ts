import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { URL } from 'url';
import { memoryListCommand, memorySummaryCommand, type KnowledgeItem } from '@ai-devkit/memory';
import type { DashboardServerHandle, DashboardServerOptions } from './command.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_GRAPH_LIMIT = 250;
const require = createRequire(import.meta.url);
const cytoscapeAssetPath = join(dirname(require.resolve('cytoscape')), 'cytoscape.esm.min.mjs');

interface GraphNode {
  id: string;
  label: string;
  type: 'memory' | 'tag' | 'scope';
  count?: number;
  item?: KnowledgeItem;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'has-tag' | 'in-scope';
}

export async function startDashboardServer(options: DashboardServerOptions): Promise<DashboardServerHandle> {
  const server = createServer((request, response) => {
    void handleRequest(request, response, options);
  });

  await listen(server, options.host, options.port);

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    url: `http://${options.host}:${port}`,
    async close(): Promise<void> {
      await closeServer(server);
    },
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: DashboardServerOptions
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  try {
    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    if (requestUrl.pathname === '/') {
      writeHtml(response, readUiAsset('dashboard.html'));
      return;
    }

    if (requestUrl.pathname === '/favicon.ico') {
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
      return;
    }

    if (requestUrl.pathname === '/assets/styles.css') {
      writeCss(response, readUiAsset('styles.css', 'tailwind.css'));
      return;
    }

    if (requestUrl.pathname === '/assets/app.js') {
      writeJavaScript(response, readUiAsset('app.js'));
      return;
    }

    if (requestUrl.pathname === '/assets/vendor/cytoscape.esm.min.mjs') {
      writeJavaScript(response, readFileSync(cytoscapeAssetPath, 'utf8'));
      return;
    }

    if (requestUrl.pathname === '/api/memory') {
      writeJson(response, 200, memoryListCommand({
        dbPath: options.dbPath,
        query: readOptionalString(requestUrl, 'query'),
        scope: readOptionalString(requestUrl, 'scope'),
        tags: readTags(requestUrl),
        limit: readOptionalInteger(requestUrl, 'limit', DEFAULT_LIMIT),
        offset: readOptionalInteger(requestUrl, 'offset', 0),
        sort: readOptionalSort(requestUrl),
      }));
      return;
    }

    if (requestUrl.pathname === '/api/summary') {
      writeJson(response, 200, memorySummaryCommand({ dbPath: options.dbPath }));
      return;
    }

    if (requestUrl.pathname === '/api/graph') {
      const list = memoryListCommand({
        dbPath: options.dbPath,
        query: readOptionalString(requestUrl, 'query'),
        scope: readOptionalString(requestUrl, 'scope'),
        tags: readTags(requestUrl),
        limit: readOptionalInteger(requestUrl, 'maxItems', DEFAULT_GRAPH_LIMIT),
        offset: 0,
        sort: readOptionalSort(requestUrl),
      });
      writeJson(response, 200, buildMemoryGraph(list.items));
      return;
    }

    writeJson(response, 404, { error: 'Not found' });
  } catch (error) {
    writeJson(response, 400, {
      error: 'Invalid request',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildMemoryGraph(items: KnowledgeItem[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const memoryNodes: GraphNode[] = [];
  const tagCounts = new Map<string, number>();
  const scopeCounts = new Map<string, number>();
  const edges: GraphEdge[] = [];

  for (const item of items) {
    const memoryNodeId = `memory:${item.id}`;
    memoryNodes.push({
      id: memoryNodeId,
      type: 'memory',
      label: item.title,
      item,
    });

    scopeCounts.set(item.scope, (scopeCounts.get(item.scope) ?? 0) + 1);
    edges.push({
      source: memoryNodeId,
      target: `scope:${item.scope}`,
      type: 'in-scope',
    });

    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      edges.push({
        source: memoryNodeId,
        target: `tag:${tag}`,
        type: 'has-tag',
      });
    }
  }

  const tagNodes = Array.from(tagCounts.entries())
    .sort(([leftTag, leftCount], [rightTag, rightCount]) => rightCount - leftCount || leftTag.localeCompare(rightTag))
    .map(([tag, count]) => ({
      id: `tag:${tag}`,
      type: 'tag' as const,
      label: tag,
      count,
    }));

  const scopeNodes = Array.from(scopeCounts.entries())
    .sort(([leftScope], [rightScope]) => leftScope.localeCompare(rightScope))
    .map(([scope, count]) => ({
      id: `scope:${scope}`,
      type: 'scope' as const,
      label: scope,
      count,
    }));

  return {
    nodes: [...memoryNodes, ...tagNodes, ...scopeNodes],
    edges,
  };
}

function readUiAsset(fileName: string, fallbackFileName?: string): string {
  try {
    return readFileSync(new URL(`./ui/${fileName}`, import.meta.url), 'utf8');
  } catch (error) {
    if (fallbackFileName && error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return readFileSync(new URL(`./ui/${fallbackFileName}`, import.meta.url), 'utf8');
    }

    throw error;
  }
}

function readOptionalString(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readTags(url: URL): string | undefined {
  const tags = url.searchParams
    .getAll('tag')
    .map(tag => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags.join(',') : undefined;
}

function readOptionalInteger(url: URL, key: string, fallback: number): number {
  const value = url.searchParams.get(key);
  if (value === null || value.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value) {
    throw new Error(`${key} must be an integer.`);
  }

  return parsed;
}

function readOptionalSort(url: URL): 'updated-desc' | 'created-desc' | 'title-asc' | undefined {
  const sort = readOptionalString(url, 'sort');
  if (sort === undefined) {
    return undefined;
  }

  if (sort === 'updated-desc' || sort === 'created-desc' || sort === 'title-asc') {
    return sort;
  }

  throw new Error('sort must be updated-desc, created-desc, or title-asc.');
}

function writeHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function writeCss(response: ServerResponse, css: string): void {
  response.writeHead(200, {
    'content-type': 'text/css; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(css);
}

function writeJavaScript(response: ServerResponse, javaScript: string): void {
  response.writeHead(200, {
    'content-type': 'text/javascript; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(javaScript);
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function listen(server: Server, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
