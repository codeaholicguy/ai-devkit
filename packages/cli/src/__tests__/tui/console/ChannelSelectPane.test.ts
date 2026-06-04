import { describe, expect, it } from 'vitest';
import { getChannelSelectRows } from '../../../tui/console/ChannelSelectPane.js';

describe('ChannelSelectPane helpers', () => {
    it('formats configured channels for selection', () => {
        expect(
            getChannelSelectRows([
                { name: 'personal', type: 'telegram', enabled: true, botUsername: 'personal_bot' },
                { name: 'work', type: 'telegram', enabled: false, botUsername: 'work_bot' },
            ], 'work'),
        ).toEqual([
            { marker: '  ', name: 'personal', detail: 'telegram @personal_bot enabled' },
            { marker: '▶ ', name: 'work', detail: 'telegram @work_bot disabled' },
        ]);
    });
});
