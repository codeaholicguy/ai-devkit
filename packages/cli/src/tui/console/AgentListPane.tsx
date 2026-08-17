import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { AgentInfo } from '@ai-devkit/agent-manager';
import { FormatStatus } from './render/formatStatus.js';
import { AGENT_TYPE_LABEL } from './render/agentTypeLabel.js';
import { SectionTitle, TUI_COLORS } from '../design-system/index.js';
import type { AgentChannelStatusMap, AgentChannelStatus } from './types.js';
import {
    getAgentDivider,
    getAgentMarker,
    isPinnedBoundary,
    MARKER_W,
    partitionPinned,
} from './agentListLayout.js';
import { findMatchPositions } from './filter/agentFilter.js';

interface AgentListPaneProps {
    agents: AgentInfo[];
    selectedName: string | null;
    onSelect: (name: string | null) => void;
    width?: number;
    height?: number;
    error?: string | null;
    channelStatuses?: AgentChannelStatusMap;
    totalAgents?: number;
    filterText?: string;
    filterEditing?: boolean;
    onFilterChange?: (value: string) => void;
    onFilterSubmit?: () => void;
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

const STATUS_W = 7;
const TYPE_W = 9; // space(1) + label up to 8 chars ("opencode")
const CHANNEL_MARKER = 'remote';
const CHANNEL_MARKER_EMPTY = ' '.repeat(CHANNEL_MARKER.length);
const CHANNEL_W = CHANNEL_MARKER.length + 1;
const ROW_CHROME = MARKER_W + STATUS_W + TYPE_W + CHANNEL_W;

interface HighlightedNameSegment {
    text: string;
    matched: boolean;
}

export function getHighlightedNameSegments(name: string, query: string, width: number): HighlightedNameSegment[] {
    const clipped = clip(name, width);
    const visibleName = clipped.endsWith('…') ? clipped.slice(0, -1) : clipped;
    const positions = findMatchPositions(name, query)?.flatMap((position, index, all) => {
        if (index % 2 === 1) return [];
        const end = all[index + 1];
        if (position >= visibleName.length) return [];
        return [position, Math.min(end, visibleName.length)];
    }) ?? null;
    if (!positions?.length) return [{ text: clipped, matched: false }];

    const segments: HighlightedNameSegment[] = [];
    let cursor = 0;
    for (let i = 0; i < positions.length; i += 2) {
        const start = positions[i];
        const end = positions[i + 1];
        if (start > cursor) segments.push({ text: visibleName.slice(cursor, start), matched: false });
        segments.push({ text: visibleName.slice(start, end), matched: true });
        cursor = end;
    }
    if (cursor < visibleName.length) segments.push({ text: visibleName.slice(cursor), matched: false });
    if (clipped.endsWith('…')) segments.push({ text: '…', matched: false });
    return segments;
}

export function clampAgentListScrollOffset(offset: number, length: number, maxVisible: number): number {
    return Math.min(Math.max(0, offset), Math.max(0, length - maxVisible));
}

interface AgentRowProps {
    agent: AgentInfo;
    isSelected: boolean;
    innerWidth: number;
    channelStatus?: AgentChannelStatus;
    filterText: string;
}

export function getAgentChannelMarker(channelStatus: AgentChannelStatus | undefined): string {
    return channelStatus ? CHANNEL_MARKER : CHANNEL_MARKER_EMPTY;
}

const AgentRow: React.FC<AgentRowProps> = ({ agent, isSelected, innerWidth, channelStatus, filterText }) => {
    const nameW = Math.max(4, innerWidth - ROW_CHROME);
    const summaryW = Math.max(4, innerWidth - MARKER_W);
    const rawSummary = agent.summary?.trim() ? agent.summary : shortPath(agent.projectPath);
    const accent = isSelected ? TUI_COLORS.accent : undefined;
    const typeLabel = AGENT_TYPE_LABEL[agent.type] ?? agent.type;

    return (
        <Box flexDirection="column" width={innerWidth}>
            <Box flexDirection="row" width={innerWidth}>
                <Box width={MARKER_W} flexShrink={0}>
                    <Text color={accent}>{getAgentMarker(isSelected, Boolean(agent.pinned))}</Text>
                </Box>
                <Box width={STATUS_W} flexShrink={0}>
                    <FormatStatus status={agent.status} />
                </Box>
                <Box width={nameW} flexShrink={0} overflow="hidden">
                    <Text color={accent} bold={isSelected}>
                        {getHighlightedNameSegments(agent.name, filterText, nameW).map((segment, index) => (
                            <Text key={index} bold={isSelected || segment.matched}>{segment.text}</Text>
                        ))}
                    </Text>
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

function computeMaxVisible(height: number, filterInPlay: boolean): number {
    const headerRows = filterInPlay ? 2 : 1;
    return Math.max(1, Math.floor((height - headerRows) / 3));
}

const AgentListPaneInner: React.FC<AgentListPaneProps> = ({
    agents,
    selectedName,
    onSelect,
    width,
    height,
    error,
    channelStatuses = {},
    totalAgents = agents.length,
    filterText = '',
    filterEditing = false,
    onFilterChange = () => undefined,
    onFilterSubmit = () => undefined,
}) => {
    const [scrollOffset, setScrollOffset] = useState(0);
    const orderedAgents = useMemo(() => partitionPinned(agents), [agents]);

    useEffect(() => {
        if (orderedAgents.length === 0) {
            if (selectedName !== null) onSelect(null);
            return;
        }
        const exists = orderedAgents.some(a => a.name === selectedName);
        if (!exists) onSelect(orderedAgents[0].name);
    }, [orderedAgents, selectedName, onSelect]);

    // Keep selected agent in view
    useEffect(() => {
        if (!height || orderedAgents.length === 0) return;
        const maxVisible = computeMaxVisible(height, filterEditing || filterText.length > 0);
        const idx = orderedAgents.findIndex(a => a.name === selectedName);
        if (idx < 0) return;
        setScrollOffset(prev => {
            if (idx < prev) return idx;
            if (idx >= prev + maxVisible) return idx - maxVisible + 1;
            return prev;
        });
    }, [selectedName, orderedAgents, height, filterEditing, filterText]);

    useEffect(() => {
        if (!height) return;
        const maxVisible = computeMaxVisible(height, filterEditing || filterText.length > 0);
        setScrollOffset(prev => clampAgentListScrollOffset(prev, orderedAgents.length, maxVisible));
    }, [orderedAgents, height, filterEditing, filterText]);

    const innerWidth = Math.max(16, width ?? 44);

    if (error && totalAgents === 0) {
        return (
            <Box flexDirection="column" width={innerWidth}>
                <SectionTitle>AGENTS</SectionTitle>
                <Text color={TUI_COLORS.danger}>{clip(error, innerWidth)}</Text>
            </Box>
        );
    }

    if (agents.length === 0 && filterText === '' && !filterEditing) {
        return (
            <Box flexDirection="column" width={innerWidth}>
                <SectionTitle>AGENTS</SectionTitle>
                <Text dimColor>No running agents.</Text>
            </Box>
        );
    }

    const filterInPlay = filterEditing || filterText.length > 0;
    const maxVisible = height ? computeMaxVisible(height, filterInPlay) : orderedAgents.length;
    const visibleAgents = orderedAgents.slice(scrollOffset, scrollOffset + maxVisible);
    const hasMore = scrollOffset + maxVisible < orderedAgents.length;
    const hasAbove = scrollOffset > 0;

    return (
        <Box flexDirection="column" width={innerWidth}>
            <Box width={innerWidth}>
                <SectionTitle>AGENTS </SectionTitle>
                <Text dimColor>({orderedAgents.length}/{totalAgents})</Text>
                {!filterEditing && filterText ? <Text color={TUI_COLORS.accent}> [filtered]</Text> : null}
                {hasAbove && <Text dimColor> ↑</Text>}
                {hasMore && <Text dimColor> ↓</Text>}
            </Box>
            {filterInPlay ? (
                <Box width={innerWidth}>
                    <Text color={TUI_COLORS.accent}>/ </Text>
                    {filterEditing ? (
                        <TextInput
                            value={filterText}
                            onChange={onFilterChange}
                            onSubmit={onFilterSubmit}
                            placeholder="Filter by name…"
                        />
                    ) : <Text>{filterText}</Text>}
                </Box>
            ) : null}
            {agents.length === 0 ? <Text dimColor>{`No agents match "${filterText}"`}</Text> : null}
            {visibleAgents.map((agent, i) => (
                <React.Fragment key={agent.name}>
                    {i > 0 && (
                        <Box width={innerWidth}>
                            <Text dimColor>{getAgentDivider(
                                innerWidth,
                                isPinnedBoundary(orderedAgents, scrollOffset + i),
                            )}</Text>
                        </Box>
                    )}
                    <AgentRow
                        agent={agent}
                        isSelected={agent.name === selectedName}
                        innerWidth={innerWidth}
                        channelStatus={channelStatuses[agent.name]}
                        filterText={filterText}
                    />
                </React.Fragment>
            ))}
        </Box>
    );
};

export const AgentListPane = React.memo(AgentListPaneInner);
