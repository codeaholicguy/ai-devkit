import { describe, expect, it } from 'vitest';
import { CONSOLE_HOTKEYS, getConsoleHotkeyHints } from '../../../tui/console/HelpPane.js';

describe('HelpPane helpers', () => {
    it('lists the console shortcuts users can press from the agent list', () => {
        expect(CONSOLE_HOTKEYS).toEqual([
            { key: 'j / Down', action: 'Select next agent' },
            { key: 'k / Up', action: 'Select previous agent' },
            { key: 's', action: 'Start a new agent' },
            { key: 'r', action: 'Rename selected agent' },
            { key: 'c', action: 'Start Telegram channel for selected agent' },
            { key: 'C', action: 'Stop Telegram channel' },
            { key: 'M', action: 'Show memory list' },
            { key: 'o', action: 'Open selected agent terminal' },
            { key: 'i / m', action: 'Message selected agent' },
            { key: 'K', action: 'Kill selected agent' },
            { key: 'h', action: 'Show or hide this help panel' },
            { key: 'q', action: 'Quit agent console' },
        ]);
    });

    it('uses the same h help shortcut in footer hints', () => {
        expect(getConsoleHotkeyHints()).toContain('h help');
    });

    it('includes rename in footer hints', () => {
        expect(getConsoleHotkeyHints()).toContain('r rename');
    });

    it('includes channel controls in footer hints', () => {
        expect(getConsoleHotkeyHints()).toContain('c channel');
        expect(getConsoleHotkeyHints()).toContain('C stop');
    });

    it('includes memory in footer hints', () => {
        expect(getConsoleHotkeyHints()).toContain('M memory');
    });
});
