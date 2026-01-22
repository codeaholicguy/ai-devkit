import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { storeKnowledge } from './handlers/store';
import { searchKnowledge } from './handlers/search';
import { KnowledgeMemoryError } from './utils/errors';
import type { StoreKnowledgeInput, SearchKnowledgeInput } from './types';

const SERVER_NAME = 'ai-devkit-memory';
const SERVER_VERSION = '0.1.0';

const STORE_TOOL = {
    name: 'memory.storeKnowledge',
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

const SEARCH_TOOL = {
    name: 'memory.searchKnowledge',
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
        },
        required: ['query'],
    },
};

export function createServer(): Server {
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
            tools: [STORE_TOOL, SEARCH_TOOL],
        };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            if (name === 'memory.storeKnowledge') {
                const input = args as unknown as StoreKnowledgeInput;
                const result = storeKnowledge(input);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            }

            if (name === 'memory.searchKnowledge') {
                const input = args as unknown as SearchKnowledgeInput;
                const result = searchKnowledge(input);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify({ error: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` }),
                    },
                ],
                isError: true,
            };
        } catch (error) {
            const errorResponse = error instanceof KnowledgeMemoryError
                ? error.toJSON()
                : { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) };

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(errorResponse, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });

    return server;
}

export async function runServer(): Promise<void> {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
