import { describe, expect, it } from 'vitest';
import {
    TUI_KEY_HINT_SEPARATOR,
    TUI_STATUS_LABELS,
    formatKeyHints,
    getPanelBorderColor,
} from '../../../tui/design-system/tokens.js';

describe('TUI design system tokens', () => {
    it('centralizes status labels and colors', () => {
        expect(TUI_STATUS_LABELS.running).toEqual({ glyph: '●', label: 'run', color: 'green' });
        expect(TUI_STATUS_LABELS.waiting).toEqual({ glyph: '◐', label: 'wait', color: 'yellow' });
        expect(TUI_STATUS_LABELS.idle).toEqual({ glyph: '○', label: 'idle', color: 'gray' });
        expect(TUI_STATUS_LABELS.unknown).toEqual({ glyph: '?', label: 'unk', color: 'red' });
    });

    it('resolves focused and inactive panel border colors consistently', () => {
        expect(getPanelBorderColor(true)).toBe('cyan');
        expect(getPanelBorderColor(false)).toBe('gray');
        expect(getPanelBorderColor(false, 'danger')).toBe('red');
    });

    it('formats keyboard hints with the shared separator', () => {
        expect(TUI_KEY_HINT_SEPARATOR).toBe(' · ');
        expect(formatKeyHints(['j/k nav', 's start', 'q quit'])).toBe('j/k nav · s start · q quit');
    });
});
