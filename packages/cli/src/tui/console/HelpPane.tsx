import React from 'react';
import { Box, Text } from 'ink';
import { KeyHints, Panel, SectionTitle, TUI_COLORS } from '../design-system/index.js';

export interface ConsoleHotkey {
    key: string;
    action: string;
}

export const CONSOLE_HOTKEYS: ConsoleHotkey[] = [
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
];

const CONSOLE_HOTKEY_KEY_WIDTH = CONSOLE_HOTKEYS.reduce((max, item) => Math.max(max, item.key.length), 0);

export function getConsoleHotkeyHints(): string[] {
    return ['j/k nav', 's start', 'r rename', 'c channel', 'C stop', 'M memory', 'o open', 'i message', 'K kill', 'h help', 'q quit'];
}

interface HelpPaneProps {
    width: number;
    height: number;
}

export const HelpPane: React.FC<HelpPaneProps> = ({ width, height }) => {
    return (
        <Panel
            width={width}
            height={height}
            focused
            paddingX={1}
            flexDirection="column"
            flexShrink={0}
        >
            <Box>
                <SectionTitle>HELP</SectionTitle>
                <Text dimColor> · hotkeys</Text>
            </Box>

            <Box flexDirection="column" marginTop={1}>
                {CONSOLE_HOTKEYS.map(({ key, action }) => (
                    <Box key={key}>
                        <Text color={TUI_COLORS.accent}>{key.padEnd(CONSOLE_HOTKEY_KEY_WIDTH)}</Text>
                        <Text dimColor>  </Text>
                        <Text>{action}</Text>
                    </Box>
                ))}
            </Box>

            <Box marginTop={1}>
                <KeyHints hints={['h back']} />
            </Box>
        </Panel>
    );
};
