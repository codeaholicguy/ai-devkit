import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { storeKnowledge } from './services/knowledge.service.js';
import { searchKnowledge } from './services/search.service.js';
import { updateKnowledge } from './services/knowledge.service.js';
import { searchKnowledgeHybrid } from './services/semantic.service.js';
import { storeKnowledgeSemantic, updateKnowledgeSemantic } from './services/semantic.service.js';
import { readSemanticConfig } from './services/config.service.js';
import { KnowledgeMemoryError } from './domain/knowledge/errors.js';
import type { StoreKnowledgeInput, SearchKnowledgeInput, UpdateKnowledgeInput } from './domain/knowledge/types.js';

const SERVER_NAME = 'ai-devkit-memory';
const SERVER_VERSION = '0.1.0';

type ToolResponse = {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
};

const STORE_TOOL = {
    name: 'memory_storeKnowledge',
    description: 'Store a new knowledge item. Use this to save actionable guidelines, rules, or patterns for future reference.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            title: {
                type: 'string',
                description: 'Short, explicit description of the rule (5-12 words, 10-100 chars)',
            },
            content: {
                type: 'string',
                description: 'Detailed explanation in markdown format. Supports code blocks and examples. (50-5000 chars)',
            },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional domain keywords (e.g., ["api", "backend"]). Max 10 tags.',
            },
            scope: {
                type: 'string',
                description: 'Optional scope: "global", "project:<name>", or "repo:<name>". Default: "global"',
            },
        },
        required: ['title', 'content'],
    },
};

const UPDATE_TOOL = {
    name: 'memory_updateKnowledge',
    description: 'Update an existing knowledge item by ID. Use this to correct outdated or inaccurate knowledge.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            id: {
                type: 'string',
                description: 'UUID of the knowledge item to update',
            },
            title: {
                type: 'string',
                description: 'New title (10-100 chars). Only provide if changing.',
            },
            content: {
                type: 'string',
                description: 'New content in markdown format (50-5000 chars). Only provide if changing.',
            },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'New tags (replaces existing). Only provide if changing. Max 10 tags.',
            },
            scope: {
                type: 'string',
                description: 'New scope: "global", "project:<name>", or "repo:<name>". Only provide if changing.',
            },
        },
        required: ['id'],
    },
};

const SEARCH_TOOL = {
    name: 'memory_searchKnowledge',
    description: 'Search for relevant knowledge based on a task description. Returns ranked results.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            query: {
                type: 'string',
                description: 'Natural language task description to search for relevant knowledge (3-500 chars)',
            },
            contextTags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional tags to boost matching results (e.g., ["api", "backend"])',
            },
            scope: {
                type: 'string',
                description: 'Optional project/repo scope filter. Results from this scope are prioritized.',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (1-20, default: 5)',
            },
            explain: {
                type: 'boolean',
                description: 'Include lexical and semantic rank details when semantic search is enabled.',
            },
        },
        required: ['query'],
    },
};

export const TOOLS = [STORE_TOOL, UPDATE_TOOL, SEARCH_TOOL];

export function createServer(): Server {
    const semanticEnabled = readSemanticConfig().enabled;
    const server = new Server(
        {
            name: SERVER_NAME,
            version: SERVER_VERSION,
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [STORE_TOOL, UPDATE_TOOL, SEARCH_TOOL],
        };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            const result = await callMemoryTool(name, args, semanticEnabled);

            return result === undefined
                ? toToolError({ error: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` })
                : toToolResponse(result);
        } catch (error) {
            const errorResponse = error instanceof KnowledgeMemoryError
                ? error.toJSON()
                : { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) };

            return toToolError(errorResponse);
        }
    });

    return server;
}

export async function runServer(): Promise<void> {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

async function callMemoryTool(
    name: string,
    args: unknown,
    semanticEnabled: boolean,
): Promise<unknown | undefined> {
    // Backward-compat: accept deprecated dotted names so agents with
    // stale prompts/templates continue to work. Remove in next major.
    if (name === 'memory_storeKnowledge' || name === 'memory.storeKnowledge') {
        const input = args as StoreKnowledgeInput;
        return semanticEnabled ? await storeKnowledgeSemantic(input) : storeKnowledge(input);
    }

    if (name === 'memory_updateKnowledge' || name === 'memory.updateKnowledge') {
        const input = args as UpdateKnowledgeInput;
        return semanticEnabled ? await updateKnowledgeSemantic(input) : updateKnowledge(input);
    }

    if (name === 'memory_searchKnowledge' || name === 'memory.searchKnowledge') {
        const input = args as SearchKnowledgeInput;
        return semanticEnabled ? await searchKnowledgeHybrid(input) : searchKnowledge(input);
    }

    return undefined;
}

function toToolResponse(result: unknown): ToolResponse {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(result, null, 2),
            },
        ],
    };
}

function toToolError(error: unknown): ToolResponse {
    return {
        ...toToolResponse(error),
        isError: true,
    };
}
