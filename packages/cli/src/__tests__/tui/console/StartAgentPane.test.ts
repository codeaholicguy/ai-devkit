import { describe, expect, it } from 'vitest';
import {
    STARTABLE_AGENT_TYPES,
    nextStartAgentType,
    normalizeStartAgentValues,
    previousStartAgentType,
    trimStartAgentError,
} from '../../../tui/console/StartAgentPane.js';

describe('StartAgentPane helpers', () => {
    it('lists supported agent start types in pane order', () => {
        expect(STARTABLE_AGENT_TYPES).toEqual(['claude', 'codex', 'copilot', 'gemini_cli', 'grok_cli', 'opencode', 'pi']);
    });

    it('cycles to the next agent type', () => {
        expect(nextStartAgentType('claude')).toBe('codex');
        expect(nextStartAgentType('codex')).toBe('copilot');
        expect(nextStartAgentType('copilot')).toBe('gemini_cli');
        expect(nextStartAgentType('opencode')).toBe('pi');
        expect(nextStartAgentType('pi')).toBe('claude');
    });

    it('cycles to the previous agent type', () => {
        expect(previousStartAgentType('copilot')).toBe('codex');
        expect(previousStartAgentType('gemini_cli')).toBe('copilot');
        expect(previousStartAgentType('pi')).toBe('opencode');
        expect(previousStartAgentType('claude')).toBe('pi');
    });

    it('normalizes submitted name and cwd without changing the selected type', () => {
        expect(
            normalizeStartAgentValues({
                type: 'gemini_cli',
                name: '  feature-agent  ',
                cwd: '  /tmp/project  ',
            }),
        ).toEqual({
            type: 'gemini_cli',
            name: 'feature-agent',
            cwd: '/tmp/project',
        });
    });

    it('keeps short error messages unchanged', () => {
        expect(trimStartAgentError('cwd does not exist', 80)).toBe('cwd does not exist');
    });

    it('clips long error messages to fit the pane width', () => {
        expect(trimStartAgentError('x'.repeat(100), 30)).toBe(`${'x'.repeat(23)}...`);
    });
});
