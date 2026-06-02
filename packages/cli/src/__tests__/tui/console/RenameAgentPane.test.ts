import { describe, expect, it } from 'vitest';
import {
    normalizeRenameAgentValues,
    trimRenameAgentError,
} from '../../../tui/console/RenameAgentPane.js';

describe('RenameAgentPane helpers', () => {
    it('trims the submitted new name', () => {
        expect(normalizeRenameAgentValues({ newName: '  renamed-agent  ' })).toEqual({
            newName: 'renamed-agent',
        });
    });

    it('keeps short error messages unchanged', () => {
        expect(trimRenameAgentError('Agent name is already in use.', 80)).toBe('Agent name is already in use.');
    });

    it('clips long error messages to fit the pane width', () => {
        expect(trimRenameAgentError('x'.repeat(100), 30)).toBe(`${'x'.repeat(23)}...`);
    });
});
