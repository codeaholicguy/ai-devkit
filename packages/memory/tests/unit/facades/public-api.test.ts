import * as api from '../../../src/api';
import * as root from '../../../src/index';
import { TOOLS } from '../../../src/server';

const PUBLIC_RUNTIME_EXPORTS = [
    'getKnowledgeSummary',
    'listKnowledge',
    'memoryDownloadSemanticCommand',
    'memoryListCommand',
    'memoryReembedCommand',
    'memorySearchCommand',
    'memorySearchCommandAsync',
    'memorySemanticStatusCommand',
    'memoryStoreCommand',
    'memoryStoreCommandAsync',
    'memorySummaryCommand',
    'memoryUpdateCommand',
    'memoryUpdateCommandAsync',
    'searchKnowledge',
    'searchKnowledgeHybrid',
    'storeKnowledge',
    'updateKnowledge',
];

describe('public compatibility surface', () => {
    it('keeps root and api runtime exports aligned', () => {
        expect(Object.keys(root).sort()).toEqual(PUBLIC_RUNTIME_EXPORTS);
        expect(Object.keys(api).sort()).toEqual(PUBLIC_RUNTIME_EXPORTS);
    });

    it('keeps MCP tool names stable', () => {
        expect(TOOLS.map(tool => tool.name)).toEqual([
            'memory_storeKnowledge',
            'memory_updateKnowledge',
            'memory_searchKnowledge',
        ]);
    });
});
