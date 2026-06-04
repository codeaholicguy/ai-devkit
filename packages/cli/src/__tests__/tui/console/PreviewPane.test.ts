import { describe, expect, it } from 'vitest';
import { getPreviewPanelTone, getPreviewChannelStatusText } from '../../../tui/console/PreviewPane.js';

describe('PreviewPane helpers', () => {
    it('uses success tone when the selected agent has channel status', () => {
        expect(getPreviewPanelTone({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 })).toBe('success');
    });

    it('uses default tone when the selected agent is not connected to a channel', () => {
        expect(getPreviewPanelTone(undefined)).toBe('default');
    });

    it('formats connected channel status text', () => {
        expect(getPreviewChannelStatusText({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 })).toBe('Connected: telegram');
    });
});
