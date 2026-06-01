import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { AgentManager } from '@ai-devkit/agent-manager';
import { ConsoleProvider, useConsoleContext } from './state/ConsoleContext.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useStartAgentPane } from './hooks/useStartAgentPane.js';
import { useKillAgentAction } from './hooks/useKillAgentAction.js';
import { AgentListPane } from './AgentListPane.js';
import { PreviewSection } from './PreviewSection.js';
import { StatusFooter } from './StatusFooter.js';
import { ChatInput } from './ChatInput.js';
import { HeaderBar } from './HeaderBar.js';
import { runAction } from './actions/runAction.js';
import { StartAgentPane } from './StartAgentPane.js';
import { KillConfirmDialog } from './KillConfirmDialog.js';
import { Panel } from '../design-system/index.js';

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
type RightPaneMode = { type: 'preview' } | { type: 'start-agent' };
type Transient = { kind: 'info' | 'error'; text: string };

export function computeCenteredDialog(cols: number, rows: number) {
    const width = Math.min(56, Math.max(24, cols - 6));
    return {
        width,
        left: Math.max(0, Math.floor((cols - width) / 2)),
        top: Math.max(1, Math.floor(rows / 2) - 3),
    };
}

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
    const [transient, setTransient] = useState<Transient | null>(null);
    const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>({ type: 'preview' });
    const startPaneActive = rightPaneMode.type === 'start-agent';
    const inputFocused = focus === 'input' && !startPaneActive;

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
    const { agents, error, lastUpdated, isLoading, refresh } = useConsoleContext();
    const agentsRef = useRef(agents);
    agentsRef.current = agents;

    useEffect(() => {
        if (!agents.length) {
            setSelectedName(null);
            return;
        }
        if (!selectedName || !agents.some(agent => agent.name === selectedName)) {
            setSelectedName(agents[0].name);
        }
    }, [agents, selectedName]);

    const getSelectedAgent = useCallback(() => {
        const name = selectedNameRef.current;
        return name ? agentsRef.current.find(agent => agent.name === name) ?? null : null;
    }, []);

    const {
        startDefaults,
        startPaneError,
        isStartingAgent,
        openStartPane,
        handleStartCancel,
        handleStartSubmit,
    } = useStartAgentPane({
        refresh,
        setFocus,
        setRightPaneMode,
        setTransient,
    });

    const {
        pendingKillName,
        openKillConfirm,
        handleKillInput,
    } = useKillAgentAction({ setTransient });

    const handleInputSubmit = useCallback((text: string) => {
        setFocus('list');
        const agent = getSelectedAgent();
        if (!agent) return;
        void runAction({ type: 'send', agentName: agent.name, message: text }).then(result => {
            if (result.error || (result.exitCode !== 0 && result.exitCode !== null)) {
                setTransient({ kind: 'error', text: result.error ?? `send exited ${result.exitCode}` });
            } else {
                setTransient({ kind: 'info', text: `Message sent to ${agent.name}` });
            }
        });
    }, [getSelectedAgent]);

    const handleInputCancel = useCallback(() => {
        setFocus('list');
    }, []);

    useInput((input, key) => {
        if (handleKillInput(input, key)) return;

        if (startPaneActive) return;

        if (focus === 'input') {
            if (key.escape) {
                setInputValue('');
                setFocus('list');
            }
            return;
        }

        if (input === 'q') { exit(); return; }

        if (input === 'K') {
            const agent = getSelectedAgent();
            if (agent) openKillConfirm(agent.name);
            return;
        }

        if (input === 'o') {
            const agent = getSelectedAgent();
            if (!agent) return;
            void runAction({ type: 'open', agentName: agent.name }).then(result => {
                if (result.error || (result.exitCode !== 0 && result.exitCode !== null)) {
                    setTransient({ kind: 'error', text: result.error ?? `open exited ${result.exitCode}` });
                }
            });
            return;
        }

        if (input === 's') {
            openStartPane();
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
    const dialog = computeCenteredDialog(cols, rows);
    const startPane = (
        <StartAgentPane
            initialName={startDefaults.name}
            initialCwd={startDefaults.cwd}
            onSubmit={handleStartSubmit}
            onCancel={handleStartCancel}
            error={startPaneError}
            isSubmitting={isStartingAgent}
            width={narrow ? listPaneWidth : rightColWidth}
            height={contentHeight}
        />
    );

    return (
        <Box flexDirection="column" width={cols}>
            <HeaderBar />
            <Box flexDirection="row">
                <Box flexShrink={0}>
                    {narrow && startPaneActive ? startPane : (
                        <Panel
                            width={listPaneWidth}
                            height={contentHeight}
                            focused={focus === 'list'}
                            paddingX={1}
                            flexDirection="column"
                        >
                            <AgentListPane
                                agents={agents}
                                selectedName={selectedName}
                                onSelect={setSelectedName}
                                width={listPaneWidth - 4}
                                height={contentHeight - 2}
                                error={error}
                            />
                        </Panel>
                    )}
                </Box>
                {!narrow && (
                    <Box flexDirection="column" width={rightColWidth} flexShrink={0} marginLeft={1}>
                        {startPaneActive ? startPane : (
                            <>
                                <PreviewSection
                                    selectedName={selectedName}
                                    height={previewHeight}
                                />
                                <Panel
                                    height={inputBoxHeight}
                                    focused={inputFocused}
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
                                </Panel>
                            </>
                        )}
                    </Box>
                )}
            </Box>
            {pendingKillName ? (
                <Box position="absolute" top={dialog.top} left={dialog.left}>
                    <KillConfirmDialog agentName={pendingKillName} width={dialog.width} />
                </Box>
            ) : null}
            <StatusFooter
                agents={agents}
                lastUpdated={lastUpdated}
                isLoading={isLoading}
                narrowNote={
                    narrow && !startPaneActive
                        ? `resize ≥${NARROW_THRESHOLD_COLS} cols to show preview`
                        : null
                }
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
