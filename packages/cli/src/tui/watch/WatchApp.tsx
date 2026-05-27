import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { AgentManager } from '@ai-devkit/agent-manager';
import { WatchProvider, useWatchContext } from './state/WatchContext.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { ListSection } from './ListSection.js';
import { PreviewSection } from './PreviewSection.js';
import { FooterSection } from './FooterSection.js';
import { ChatInput } from './ChatInput.js';
import { HeaderBar } from './HeaderBar.js';
import type { WatchAction } from './actions/types.js';

interface WatchAppProps {
    manager: AgentManager;
    initialSelection?: string | null;
    onIntent?: (action: WatchAction) => void;
    transientMessage?: { kind: 'info' | 'error'; text: string } | null;
}

const NARROW_THRESHOLD_COLS = 120;
const LIST_PANE_WIDTH = 48;
const FOOTER_HEIGHT = 2;
const HEADER_HEIGHT = 1;
const MIN_CONTENT_HEIGHT = 12;
const INPUT_BOX_CHROME_ROWS = 2;

type Focus = 'list' | 'input';

const WatchAppShell: React.FC<{
    initialSelection: string | null;
    onIntent?: (action: WatchAction) => void;
    transientMessage: { kind: 'info' | 'error'; text: string } | null;
    setInputFocused: (v: boolean) => void;
}> = ({ initialSelection, onIntent, transientMessage, setInputFocused }) => {
    const { exit } = useApp();
    const [selectedName, setSelectedName] = useState<string | null>(initialSelection);
    const [focus, setFocus] = useState<Focus>('list');
    const [inputLines, setInputLines] = useState(1);
    const [inputValue, setInputValue] = useState('');
    const inputFocused = focus === 'input';

    useEffect(() => {
        if (!inputFocused) setInputLines(1);
    }, [inputFocused]);

    useEffect(() => { setInputFocused(inputFocused); }, [inputFocused, setInputFocused]);

    const onIntentRef = useRef(onIntent);
    onIntentRef.current = onIntent;
    const exitRef = useRef(exit);
    exitRef.current = exit;
    const selectedNameRef = useRef(selectedName);
    selectedNameRef.current = selectedName;
    const { agents } = useWatchContext();
    const agentsRef = useRef(agents);
    agentsRef.current = agents;

    const handleInputSubmit = useCallback((text: string) => {
        setFocus('list');
        const name = selectedNameRef.current;
        const agent = name ? agentsRef.current.find(a => a.name === name) : null;
        const intent = onIntentRef.current;
        if (agent && intent) {
            intent({ type: 'send', agentName: agent.name, message: text });
            exitRef.current();
        }
    }, []);

    const handleInputCancel = useCallback(() => {
        setFocus('list');
    }, []);

    // All keyboard handling lives here — useInput inside React.memo components
    // does not fire reliably in Ink 7 + React 19.
    useInput((input, key) => {
        if (focus === 'input') {
            if (key.escape) {
                setInputValue('');
                setFocus('list');
            }
            return;
        }

        if (input === 'q') {
            exit();
            return;
        }
        if (input === 'o') {
            const name = selectedNameRef.current;
            const agent = name ? agentsRef.current.find(a => a.name === name) : null;
            if (agent && onIntent) {
                onIntent({ type: 'open', agentName: agent.name });
                exit();
            }
            return;
        }
        if (input === 'i' || input === 'm') {
            const name = selectedNameRef.current;
            if (name) setFocus('input');
            return;
        }
        if (key.downArrow || input === 'j') {
            const list = agentsRef.current;
            if (list.length === 0) return;
            const idx = Math.max(0, list.findIndex(a => a.name === selectedNameRef.current));
            setSelectedName(list[(idx + 1) % list.length].name);
            return;
        }
        if (key.upArrow || input === 'k') {
            const list = agentsRef.current;
            if (list.length === 0) return;
            const idx = Math.max(0, list.findIndex(a => a.name === selectedNameRef.current));
            setSelectedName(list[(idx - 1 + list.length) % list.length].name);
            return;
        }
    });

    const [, forceTick] = useState(0);
    useEffect(() => {
        if (!transientMessage) return;
        const handle = setTimeout(() => forceTick(t => t + 1), 4000);
        return () => clearTimeout(handle);
    }, [transientMessage]);

    const { cols, rows } = useTerminalSize();
    const narrow = cols < NARROW_THRESHOLD_COLS;
    const inputBoxHeight = inputLines + INPUT_BOX_CHROME_ROWS;
    const totalHeight = Math.max(
        MIN_CONTENT_HEIGHT + inputBoxHeight + FOOTER_HEIGHT + HEADER_HEIGHT,
        rows - 1,
    );
    const contentHeight = Math.max(MIN_CONTENT_HEIGHT, totalHeight - FOOTER_HEIGHT - HEADER_HEIGHT);
    const previewHeight = contentHeight - inputBoxHeight;
    const listHeight = contentHeight;

    const listPaneWidth = narrow ? cols - 2 : LIST_PANE_WIDTH;
    // marginLeft(1) + border(2) accounted for; right col fills the rest exactly.
    const rightColWidth = Math.max(20, cols - listPaneWidth - 1);
    const inputInnerWidth = Math.max(4, rightColWidth - 4);

    return (
        <Box flexDirection="column">
            <HeaderBar />
            <Box flexDirection="row">
                <Box flexShrink={0}>
                    <ListSection
                        selectedName={selectedName}
                        onSelect={setSelectedName}
                        focused={focus === 'list'}
                        width={listPaneWidth}
                        height={listHeight}
                    />
                </Box>
                {!narrow && (
                    <Box flexDirection="column" width={rightColWidth} flexShrink={0} marginLeft={1}>
                        <PreviewSection
                            selectedName={selectedName}
                            height={previewHeight}
                        />
                        <Box
                            height={inputBoxHeight}
                            borderStyle="round"
                            borderColor={inputFocused ? 'cyan' : 'gray'}
                            paddingX={1}
                            flexDirection="column"
                            flexShrink={0}
                        >
                            <ChatInput
                                focused={inputFocused}
                                value={inputValue}
                                onChange={setInputValue}
                                onSubmit={handleInputSubmit}
                                onCancel={handleInputCancel}
                                innerWidth={inputInnerWidth}
                                onLineCountChange={setInputLines}
                            />
                        </Box>
                    </Box>
                )}
            </Box>
            <FooterSection
                selectedName={selectedName}
                narrowNote={narrow ? `resize ≥${NARROW_THRESHOLD_COLS} cols to show preview` : null}
                transient={transientMessage}
            />
        </Box>
    );
};

export const WatchApp: React.FC<WatchAppProps> = ({
    manager,
    initialSelection = null,
    onIntent,
    transientMessage = null,
}) => {
    const [inputFocused, setInputFocused] = useState(false);
    return (
        <WatchProvider manager={manager} inputFocused={inputFocused}>
            <WatchAppShell
                initialSelection={initialSelection}
                onIntent={onIntent}
                transientMessage={transientMessage}
                setInputFocused={setInputFocused}
            />
        </WatchProvider>
    );
};
