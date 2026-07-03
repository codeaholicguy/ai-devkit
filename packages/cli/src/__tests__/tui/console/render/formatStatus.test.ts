import { AgentStatus } from '@ai-devkit/agent-manager';
import { describe, expect, it } from 'vitest';
import { TUI_STATUS_LABELS } from '../../../../tui/design-system/index.js';
import { getStatusDisplay } from '../../../../tui/console/render/formatStatus.js';

describe('getStatusDisplay', () => {
    it('returns display values for known statuses', () => {
        expect(getStatusDisplay(AgentStatus.RUNNING)).toEqual(TUI_STATUS_LABELS.running);
        expect(getStatusDisplay(AgentStatus.WAITING)).toEqual(TUI_STATUS_LABELS.waiting);
        expect(getStatusDisplay(AgentStatus.IDLE)).toEqual(TUI_STATUS_LABELS.idle);
        expect(getStatusDisplay(AgentStatus.UNKNOWN)).toEqual(TUI_STATUS_LABELS.unknown);
    });

    it('falls back to unknown for unsupported status values', () => {
        expect(getStatusDisplay('paused' as AgentStatus)).toEqual(TUI_STATUS_LABELS.unknown);
    });
});
