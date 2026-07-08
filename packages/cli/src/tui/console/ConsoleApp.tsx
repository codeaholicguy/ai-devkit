import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { AgentManager } from '@ai-devkit/agent-manager';
import { ConsoleProvider, useConsoleContext } from './state/ConsoleContext.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useStartAgentPane } from './hooks/useStartAgentPane.js';
import { useRenameAgentPane } from './hooks/useRenameAgentPane.js';
import { useKillAgentAction } from './hooks/useKillAgentAction.js';
import { useChannelActions } from './hooks/useChannelActions.js';
import { AgentListPane } from './AgentListPane.js';
import { PreviewSection } from './PreviewSection.js';
import { StatusFooter } from './StatusFooter.js';
import { ChatInput } from './ChatInput.js';
import { HeaderBar } from './HeaderBar.js';
import { runAction } from './actions/runAction.js';
import { StartAgentPane } from './StartAgentPane.js';
import { RenameAgentPane } from './RenameAgentPane.js';
import { ChannelSelectPane } from './ChannelSelectPane.js';
import { HelpPane } from './HelpPane.js';
import { MemoryListPane } from './MemoryListPane.js';
import { KillConfirmDialog } from './KillConfirmDialog.js';
import type { ConsoleFocus, RightPaneMode, TransientMessage } from './types.js';
import { Panel } from '../design-system/index.js';
import { getNextRightPaneModeForMemoryShortcut } from './rightPaneMode.js';

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
    const [focus, setFocus] = useState<ConsoleFocus>('list');
    const [inputLines, setInputLines] = useState(1);
    const [inputValue, setInputValue] = useState('');
    const [transient, setTransient] = useState<TransientMessage | null>(null);
    const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>({ type: 'preview' });
    const startPaneActive = rightPaneMode.type === 'start-agent';
    const renamePaneActive = rightPaneMode.type === 'rename-agent';
    const channelSelectPaneActive = rightPaneMode.type === 'channel-select';
    const memoryListPaneActive = rightPaneMode.type === 'memory-list';
    const helpPaneActive = rightPaneMode.type === 'help';
    const inputFocused = focus === 'input' && !startPaneActive && !renamePaneActive && !channelSelectPaneActive && !memoryListPaneActive && !helpPaneActive;

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
    const {
        agents,
        error,
        lastUpdated,
        isLoading,
        refresh,
        channelStatuses,
        configuredChannels,
        refreshConfiguredChannels,
        refreshChannels,
    } = useConsoleContext();
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

    const {
        renamePaneError,
        isRenamingAgent,
        openRenamePane,
        handleRenameCancel,
        handleRenameSubmit,
    } = useRenameAgentPane({
        setFocus,
        setRightPaneMode,
        setTransient,
    });

    const {
        openChannelSelect,
        startChannel,
        stopAgentChannel,
    } = useChannelActions({
        channelStatuses,
        refreshChannels,
        refreshConfiguredChannels,
        setRightPaneMode,
        setTransient,
    });

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

        if (startPaneActive || renamePaneActive || channelSelectPaneActive) return;

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

        if (input === 'c') {
            openChannelSelect(getSelectedAgent());
            return;
        }

        if (input === 'C') {
            stopAgentChannel(getSelectedAgent());
            return;
        }

        if (input === 'M') {
            setRightPaneMode(getNextRightPaneModeForMemoryShortcut);
            return;
        }

        if (input === 's') {
            openStartPane();
            return;
        }

        if (input === 'r') {
            const agent = getSelectedAgent();
            if (agent) openRenamePane(agent.name);
            return;
        }

        if (input === 'h') {
            setRightPaneMode(current => current.type === 'help' ? { type: 'preview' } : { type: 'help' });
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
    const layout = computeLayout(cols, rows, inputLines, narrow);
    const { inputBoxHeight, contentHeight, previewHeight, listPaneWidth, rightColWidth, inputInnerWidth } = layout;
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
    const helpPane = (
        <HelpPane
            width={narrow ? listPaneWidth : rightColWidth}
            height={contentHeight}
        />
    );
    const memoryListPane = (
        <MemoryListPane
            width={narrow ? listPaneWidth : rightColWidth}
            height={contentHeight}
        />
    );
    const renamePane = renamePaneActive ? (
        <RenameAgentPane
            currentName={rightPaneMode.agentName}
            initialName={rightPaneMode.agentName}
            onSubmit={(values) => handleRenameSubmit(rightPaneMode.agentName, values)}
            onCancel={handleRenameCancel}
            error={renamePaneError}
            isSubmitting={isRenamingAgent}
            width={narrow ? listPaneWidth : rightColWidth}
            height={contentHeight}
        />
    ) : null;
    const channelSelectPane = channelSelectPaneActive ? (
        <ChannelSelectPane
            agentName={rightPaneMode.agentName}
            channels={configuredChannels}
            onSubmit={(channelName) => startChannel(channelName, rightPaneMode.agentName)}
            onCancel={() => setRightPaneMode({ type: 'preview' })}
            width={narrow ? listPaneWidth : rightColWidth}
            height={contentHeight}
        />
    ) : null;
    let replacementPane: React.ReactNode = null;
    if (startPaneActive) replacementPane = startPane;
    if (renamePaneActive) replacementPane = renamePane;
    if (channelSelectPaneActive) replacementPane = channelSelectPane;
    if (memoryListPaneActive) replacementPane = memoryListPane;
    if (helpPaneActive) replacementPane = helpPane;
    const listPane = (
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
                channelStatuses={channelStatuses}
            />
        </Panel>
    );
    const previewAndInputPane = (
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
    );

    return (
        <Box flexDirection="column" width={cols}>
            <HeaderBar />
            <Box flexDirection="row">
                <Box flexShrink={0}>
                    {narrow && replacementPane ? replacementPane : listPane}
                </Box>
                {!narrow && (
                    <Box flexDirection="column" width={rightColWidth} flexShrink={0} marginLeft={1}>
                        {replacementPane ?? previewAndInputPane}
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
                    narrow && !startPaneActive && !renamePaneActive && !channelSelectPaneActive && !memoryListPaneActive && !helpPaneActive
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
