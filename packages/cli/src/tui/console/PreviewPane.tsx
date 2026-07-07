import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, ConversationMessage } from '@ai-devkit/agent-manager';
import type { ConversationFetchError } from './hooks/useAgentConversation.js';
import { formatRelative } from './render/formatRelative.js';
import { AGENT_TYPE_LABEL_DISPLAY } from './render/agentTypeLabel.js';
import { SectionTitle, TUI_COLORS } from '../design-system/index.js';
import type { AgentChannelStatus } from './types.js';
import type { PanelTone } from '../design-system/tokens.js';

interface PreviewPaneProps {
    agent: AgentInfo | null;
    messages: ConversationMessage[];
    error: ConversationFetchError | null;
    isLoading: boolean;
    maxLines?: number;
    channelStatus?: AgentChannelStatus;
    scrollOffset?: number;
    onScrollOffsetClamp?: (offset: number) => void;
}

const ROLE_COLOR: Record<ConversationMessage['role'], 'green' | 'cyan' | 'yellow'> = {
    user: TUI_COLORS.success,
    assistant: TUI_COLORS.accent,
    system: TUI_COLORS.warning,
};


function shortPath(p: string): string {
    const home = process.env.HOME ?? '';
    if (home && p.startsWith(home)) return '~' + p.slice(home.length);
    return p;
}

export interface PreviewViewportRow {
    text: string;
    role: ConversationMessage['role'] | null;
}

export interface PreviewViewport {
    rows: PreviewViewportRow[];
    clampedOffset: number;
    maxOffset: number;
    hasAbove: boolean;
    hasBelow: boolean;
}

export function countPreviewRows(messages: ConversationMessage[]): number {
    return messages.reduce((total, msg) => total + Math.max(1, msg.content.split('\n').length), 0);
}

export function adjustPreviewScrollOffsetForAppendedRows(
    previousRowCount: number,
    currentRowCount: number,
    requestedOffset: number,
): number {
    if (requestedOffset <= 0 || currentRowCount <= previousRowCount) return requestedOffset;
    return requestedOffset + currentRowCount - previousRowCount;
}

export function buildPreviewViewport(
    messages: ConversationMessage[],
    maxLines: number,
    requestedOffset: number,
): PreviewViewport {
    const budget = Math.max(1, Math.floor(maxLines));
    const rows = messages.flatMap((msg) => {
        const contentLines = msg.content.split('\n');
        const first = contentLines[0] ?? '';
        return [
            { text: `${msg.role}: ${first}`, role: msg.role },
            ...contentLines.slice(1).map(line => ({ text: `  ${line}`, role: null })),
        ];
    });
    const contentBudget = rows.length > budget ? Math.max(1, budget - 1) : budget;
    const maxOffset = Math.max(0, rows.length - contentBudget);
    const clampedOffset = Math.min(Math.max(0, Math.floor(requestedOffset)), maxOffset);
    const end = Math.max(0, rows.length - clampedOffset);
    const start = Math.max(0, end - contentBudget);
    const hasAbove = start > 0;
    const hasBelow = end < rows.length;
    const indicator = hasAbove || hasBelow
        ? [{ text: `${hasAbove ? '↑ older' : '       '}${hasBelow ? ' ↓ newer' : ''}`, role: null }]
        : [];
    return {
        rows: [...indicator, ...rows.slice(start, end)],
        clampedOffset,
        maxOffset,
        hasAbove,
        hasBelow,
    };
}

export function getPreviewPanelTone(channelStatus: AgentChannelStatus | undefined): PanelTone {
    return channelStatus ? 'success' : 'default';
}

export function getPreviewChannelStatusText(channelStatus: AgentChannelStatus | undefined): string | null {
    return channelStatus ? `Connected: ${channelStatus.channelName}` : null;
}

const MetadataHeader: React.FC<{ agent: AgentInfo; channelStatus?: AgentChannelStatus }> = ({ agent, channelStatus }) => (
    <Box>
        <SectionTitle>PREVIEW</SectionTitle>
        <Text dimColor> · </Text>
        <Text color={TUI_COLORS.accent}>{agent.name}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{AGENT_TYPE_LABEL_DISPLAY[agent.type] ?? agent.type}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{formatRelative(agent.lastActive)}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{shortPath(agent.projectPath)}</Text>
        {channelStatus ? (
            <>
                <Text dimColor> · </Text>
                <Text color={TUI_COLORS.success}>{getPreviewChannelStatusText(channelStatus)}</Text>
            </>
        ) : null}
    </Box>
);

const PreviewPaneInner: React.FC<PreviewPaneProps> = ({
    agent,
    messages,
    error,
    isLoading,
    maxLines = 22,
    channelStatus,
    scrollOffset = 0,
    onScrollOffsetClamp,
}) => {
    const rowCount = countPreviewRows(messages);
    const previousRowCountRef = useRef(rowCount);
    const adjustedScrollOffset = adjustPreviewScrollOffsetForAppendedRows(
        previousRowCountRef.current,
        rowCount,
        scrollOffset,
    );
    const viewport = messages.length > 0
        ? buildPreviewViewport(messages, Math.max(4, maxLines), adjustedScrollOffset)
        : null;
    const clampedOffset = viewport?.clampedOffset;

    useEffect(() => {
        if (clampedOffset !== undefined && clampedOffset !== scrollOffset) {
            onScrollOffsetClamp?.(clampedOffset);
        }
    }, [onScrollOffsetClamp, scrollOffset, clampedOffset]);

    useEffect(() => {
        previousRowCountRef.current = rowCount;
    }, [rowCount]);

    if (!agent) {
        return (
            <Box flexDirection="column">
                <SectionTitle>PREVIEW</SectionTitle>
                <Text dimColor>No agent selected.</Text>
            </Box>
        );
    }

    let body: React.ReactNode;
    if (error) {
        const detail = error.kind === 'no-session-file'
            ? 'No session file available for this agent yet.'
            : error.kind === 'no-adapter'
                ? `Unsupported agent type: ${agent.type}.`
                : `Could not read session file: ${error.message}`;
        body = <Text color={TUI_COLORS.danger}>{detail}</Text>;
    } else if (isLoading && messages.length === 0) {
        body = <Text dimColor>loading…</Text>;
    } else if (messages.length === 0) {
        body = <Text dimColor>No messages yet.</Text>;
    } else {
        body = (
            <>
                {viewport?.rows.map((row, idx) => (
                    <Box key={idx}>
                        <Text color={row.role ? ROLE_COLOR[row.role] : undefined}>{row.text}</Text>
                    </Box>
                ))}
            </>
        );
    }

    return (
        <Box flexDirection="column">
            <MetadataHeader agent={agent} channelStatus={channelStatus} />
            <Box flexDirection="column" flexGrow={1}>
                {body}
            </Box>
        </Box>
    );
};

export const PreviewPane = React.memo(PreviewPaneInner);
