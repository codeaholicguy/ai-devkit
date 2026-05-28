import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { AgentManager } from '@ai-devkit/agent-manager';
import { ConsoleProvider, useConsoleContext } from './state/ConsoleContext.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { AgentListPane } from './AgentListPane.js';
import { PreviewSection } from './PreviewSection.js';
import { StatusFooter } from './StatusFooter.js';
import { ChatInput } from './ChatInput.js';
import { HeaderBar } from './HeaderBar.js';
import { runAction } from './actions/runAction.js';

interface ConsoleAppProps {
    manager: AgentManager;
    initialSelection?: string | null;
}

const NARROW_THRESHOLD_COLS = 120;
const LIST_PANE_WIDTH = 48;
const FOOTER_HEIGHT = 2;
const HEADER_HEIGHT = 1;
const MIN_CONTENT_HEIGHT = 12;
const INPUT_BOX_CHROME_ROWS = 2;

type Focus = 'list' | 'input';

export function computeLayout(cols: number, rows: number, inputLines: number, narrow: boolean) {
    const inputBoxHeight = inputLines + INPUT_BOX_CHROME_ROWS;
    const totalHeight = Math.max(
        MIN_CONTENT_HEIGHT + inputBoxHeight + FOOTER_HEIGHT + HEADER_HEIGHT,
        rows - 1,
    );
    const contentHeight = Math.max(MIN_CONTENT_HEIGHT, totalHeight - FOOTER_HEIGHT - HEADER_HEIGHT);
    const listPaneWidth = narrow ? cols - 2 : LIST_PANE_WIDTH;
    const rightColWidth = Math.max(20, cols - listPaneWidth - 1);
    return {
        inputBoxHeight,
        contentHeight,
        previewHeight: contentHeight - inputBoxHeight,
        listPaneWidth,
        rightColWidth,
        inputInnerWidth: Math.max(4, rightColWidth - 4),
    };
}

const ConsoleAppShell: React.FC<{
    initialSelection: string | null;
    setInputFocused: (v: boolean) => void;
}> = ({ initialSelection, setInputFocused }) => {
    const { exit } = useApp();
    const [selectedName, setSelectedName] = useState<string | null>(initialSelection);
    const [focus, setFocus] = useState<Focus>('list');
    const [inputLines, setInputLines] = useState(1);
    const [inputValue, setInputValue] = useState('');
    const [transient, setTransient] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
    const inputFocused = focus === 'input';

    useEffect(() => {
        if (!inputFocused) setInputLines(1);
    }, [inputFocused]);

    useEffect(() => { setInputFocused(inputFocused); }, [inputFocused, setInputFocused]);

    useEffect(() => {
        if (!transient) return;
        const t = setTimeout(() => setTransient(null), 4000);
        return () => clearTimeout(t);
    }, [transient]);

    const selectedNameRef = useRef(selectedName);
    selectedNameRef.current = selectedName;
    const { agents, error, lastUpdated, isLoading } = useConsoleContext();
    const agentsRef = useRef(agents);
    agentsRef.current = agents;

    const handleInputSubmit = useCallback((text: string) => {
        setFocus('list');
        const name = selectedNameRef.current;
        const agent = name ? agentsRef.current.find(a => a.name === name) : null;
        if (!agent) return;
        void runAction({ type: 'send', agentName: agent.name, message: text }).then(result => {
            if (result.error || (result.exitCode !== 0 && result.exitCode !== null)) {
                setTransient({ kind: 'error', text: result.error ?? `send exited ${result.exitCode}` });
            } else {
                setTransient({ kind: 'info', text: `Message sent to ${agent.name}` });
            }
        });
    }, []);

    const handleInputCancel = useCallback(() => {
        setFocus('list');
    }, []);

    useInput((input, key) => {
        if (focus === 'input') {
            if (key.escape) {
                setInputValue('');
                setFocus('list');
            }
            return;
        }

        if (input === 'q') { exit(); return; }

        if (input === 'o') {
            const name = selectedNameRef.current;
            const agent = name ? agentsRef.current.find(a => a.name === name) : null;
            if (!agent) return;
            void runAction({ type: 'open', agentName: agent.name }).then(result => {
                if (result.error || (result.exitCode !== 0 && result.exitCode !== null)) {
                    setTransient({ kind: 'error', text: result.error ?? `open exited ${result.exitCode}` });
                }
            });
            return;
        }

        if (input === 'i' || input === 'm') {
            if (selectedNameRef.current) setFocus('input');
            return;
        }

        if (key.downArrow || input === 'j') {
            const list = agentsRef.current;
            if (!list.length) return;
            const idx = Math.max(0, list.findIndex(a => a.name === selectedNameRef.current));
            setSelectedName(list[(idx + 1) % list.length].name);
            return;
        }

        if (key.upArrow || input === 'k') {
            const list = agentsRef.current;
            if (!list.length) return;
            const idx = Math.max(0, list.findIndex(a => a.name === selectedNameRef.current));
            setSelectedName(list[(idx - 1 + list.length) % list.length].name);
            return;
        }
    });

    const { cols, rows } = useTerminalSize();
    const narrow = cols < NARROW_THRESHOLD_COLS;
    const { inputBoxHeight, contentHeight, previewHeight, listPaneWidth, rightColWidth, inputInnerWidth } = computeLayout(cols, rows, inputLines, narrow);

    return (
        <Box flexDirection="column">
            <HeaderBar />
            <Box flexDirection="row">
                <Box flexShrink={0}>
                    <Box
                        width={listPaneWidth}
                        height={contentHeight}
                        borderStyle="round"
                        borderColor={focus === 'list' ? 'cyan' : 'gray'}
                        paddingX={1}
                        flexDirection="column"
                    >
                        <AgentListPane
                            agents={agents}
                            selectedName={selectedName}
                            onSelect={setSelectedName}
                            width={listPaneWidth - 4}
                            error={error}
                        />
                    </Box>
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
            <StatusFooter
                agents={agents}
                lastUpdated={lastUpdated}
                isLoading={isLoading}
                narrowNote={narrow ? `resize ≥${NARROW_THRESHOLD_COLS} cols to show preview` : null}
                transient={transient}
            />
        </Box>
    );
};

export const ConsoleApp: React.FC<ConsoleAppProps> = ({
    manager,
    initialSelection = null,
}) => {
    const [inputFocused, setInputFocused] = useState(false);
    return (
        <ConsoleProvider manager={manager} inputFocused={inputFocused}>
            <ConsoleAppShell
                initialSelection={initialSelection}
                setInputFocused={setInputFocused}
            />
        </ConsoleProvider>
    );
};
