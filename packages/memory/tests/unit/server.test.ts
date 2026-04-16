import { TOOLS } from '../../src/server';

describe('MCP server tool names', () => {
    const MCP_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

    it('should register at least one tool', () => {
        expect(TOOLS.length).toBeGreaterThan(0);
    });

    it.each(TOOLS.map(tool => [tool.name, tool]))(
        'tool name "%s" should satisfy MCP client naming regex ^[a-zA-Z0-9_-]{1,64}$',
        (name) => {
            expect(name).toMatch(MCP_TOOL_NAME_PATTERN);
        }
    );

    it('should not contain duplicate tool names', () => {
        const names = TOOLS.map(tool => tool.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });
});
