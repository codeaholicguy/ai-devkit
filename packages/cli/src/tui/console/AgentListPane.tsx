import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo } from '@ai-devkit/agent-manager';
import { FormatStatus } from './render/formatStatus.js';
import { AGENT_TYPE_LABEL } from './render/agentTypeLabel.js';
import { SectionTitle, TUI_COLORS } from '../design-system/index.js';
import type { AgentChannelStatusMap, AgentChannelStatus } from './types.js';

interface AgentListPaneProps {
    agents: AgentInfo[];
    selectedName: string | null;
    onSelect: (name: string | null) => void;
    width?: number;
    height?: number;
    error?: string | null;
    channelStatuses?: AgentChannelStatusMap;
}

function clip(s: string | undefined, max: number): string {
    const text = (s ?? '').replace(/\n/g, ' ').trimEnd();
    if (max <= 0) return '';
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '…';
}

function shortPath(p: string): string {
    const home = process.env.HOME ?? '';
    return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

const MARKER_W = 2;
const STATUS_W = 7;
const TYPE_W = 9; // space(1) + label up to 8 chars ("opencode")
const CHANNEL_MARKER = 'remote';
const CHANNEL_MARKER_EMPTY = ' '.repeat(CHANNEL_MARKER.length);
const CHANNEL_W = CHANNEL_MARKER.length + 1;
const ROW_CHROME = MARKER_W + STATUS_W + TYPE_W + CHANNEL_W;

interface AgentRowProps {
    agent: AgentInfo;
    isSelected: boolean;
    innerWidth: number;
    channelStatus?: AgentChannelStatus;
}

export function getAgentChannelMarker(channelStatus: AgentChannelStatus | undefined): string {
    return channelStatus ? CHANNEL_MARKER : CHANNEL_MARKER_EMPTY;
}

const AgentRow: React.FC<AgentRowProps> = ({ agent, isSelected, innerWidth, channelStatus }) => {
    const nameW = Math.max(4, innerWidth - ROW_CHROME);
    const summaryW = Math.max(4, innerWidth - MARKER_W);
    const rawSummary = agent.summary?.trim() ? agent.summary : shortPath(agent.projectPath);
    const accent = isSelected ? TUI_COLORS.accent : undefined;
    const typeLabel = AGENT_TYPE_LABEL[agent.type] ?? agent.type;

    return (
        <Box flexDirection="column" width={innerWidth}>
            <Box flexDirection="row" width={innerWidth}>
                <Box width={MARKER_W} flexShrink={0}>
                    <Text color={accent}>{isSelected ? '▶ ' : '  '}</Text>
                </Box>
                <Box width={STATUS_W} flexShrink={0}>
                    <FormatStatus status={agent.status} />
                </Box>
                <Box width={nameW} flexShrink={0} overflow="hidden">
                    <Text color={accent} bold={isSelected}>{clip(agent.name, nameW)}</Text>
                </Box>
                <Box width={TYPE_W} flexShrink={0}>
                    <Text dimColor> {typeLabel}</Text>
                </Box>
                <Box width={CHANNEL_W} flexShrink={0}>
                    <Text color={channelStatus ? TUI_COLORS.success : undefined}>{getAgentChannelMarker(channelStatus)}</Text>
                </Box>
            </Box>
            <Box flexDirection="row" width={innerWidth}>
                <Box width={MARKER_W} flexShrink={0} />
                <Box width={summaryW} flexShrink={0} overflow="hidden">
                    <Text dimColor>{clip(rawSummary, summaryW)}</Text>
                </Box>
            </Box>
        </Box>
    );
};

// Header = 2 lines (title + marginBottom={1}). Each agent = 2 content lines + 1 divider line.
// For N agents: total = 2 + 3N - 1 = 1 + 3N. So maxVisible = floor((height - 1) / 3).
function computeMaxVisible(height: number): number {
    return Math.max(1, Math.floor((height - 1) / 3));
}

const AgentListPaneInner: React.FC<AgentListPaneProps> = ({
    agents,
    selectedName,
    onSelect,
    width,
    height,
    error,
    channelStatuses = {},
}) => {
    const [scrollOffset, setScrollOffset] = useState(0);

    useEffect(() => {
        if (agents.length === 0) {
            if (selectedName !== null) onSelect(null);
            return;
        }
        const exists = agents.some(a => a.name === selectedName);
        if (!exists) onSelect(agents[0].name);
    }, [agents, selectedName, onSelect]);

    // Keep selected agent in view
    useEffect(() => {
        if (!height || agents.length === 0) return;
        const maxVisible = computeMaxVisible(height);
        const idx = agents.findIndex(a => a.name === selectedName);
        if (idx < 0) return;
        setScrollOffset(prev => {
            if (idx < prev) return idx;
            if (idx >= prev + maxVisible) return idx - maxVisible + 1;
            return prev;
        });
    }, [selectedName, agents, height]);

    const innerWidth = Math.max(16, width ?? 44);

    if (error && agents.length === 0) {
        return (
            <Box flexDirection="column" width={innerWidth}>
                <SectionTitle>AGENTS</SectionTitle>
                <Text color={TUI_COLORS.danger}>{clip(error, innerWidth)}</Text>
            </Box>
        );
    }

    if (agents.length === 0) {
        return (
            <Box flexDirection="column" width={innerWidth}>
                <SectionTitle>AGENTS</SectionTitle>
                <Text dimColor>No running agents.</Text>
            </Box>
        );
    }

    const divider = '─'.repeat(innerWidth);
    const maxVisible = height ? computeMaxVisible(height) : agents.length;
    const visibleAgents = agents.slice(scrollOffset, scrollOffset + maxVisible);
    const hasMore = scrollOffset + maxVisible < agents.length;
    const hasAbove = scrollOffset > 0;

    return (
        <Box flexDirection="column" width={innerWidth}>
            <Box width={innerWidth} marginBottom={1}>
                <SectionTitle>AGENTS </SectionTitle>
                <Text dimColor>({agents.length})</Text>
                {hasAbove && <Text dimColor> ↑</Text>}
                {hasMore && <Text dimColor> ↓</Text>}
            </Box>
            {visibleAgents.map((agent, i) => (
                <React.Fragment key={agent.name}>
                    {i > 0 && (
                        <Box width={innerWidth}>
                            <Text dimColor>{divider}</Text>
                        </Box>
                    )}
                    <AgentRow
                        agent={agent}
                        isSelected={agent.name === selectedName}
                        innerWidth={innerWidth}
                        channelStatus={channelStatuses[agent.name]}
                    />
                </React.Fragment>
            ))}
        </Box>
    );
};

export const AgentListPane = React.memo(AgentListPaneInner);
