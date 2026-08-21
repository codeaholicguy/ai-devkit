import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { AgentStatus, type AgentInfo, type ConversationMessage } from '@ai-devkit/agent-manager';
import type { ConversationFetchError } from './hooks/useAgentConversation.js';
import { formatRelative } from './render/formatRelative.js';
import { AGENT_TYPE_LABEL_DISPLAY } from './render/agentTypeLabel.js';
import { SectionTitle, TUI_COLORS } from '../design-system/index.js';
import type { AgentChannelStatus } from './types.js';
import type { PanelTone } from '../design-system/tokens.js';
import {
    renderMarkdownRows,
    type MarkdownPreviewSpan,
} from './render/markdownPreview.js';
import { PreviewActivityIndicator } from './PreviewActivityIndicator.js';

interface PreviewPaneProps {
    agent: AgentInfo | null;
    messages: ConversationMessage[];
    error: ConversationFetchError | null;
    isLoading: boolean;
    maxLines?: number;
    channelStatus?: AgentChannelStatus;
    scrollOffset?: number;
    contentWidth?: number;
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
    kind: 'header' | 'content' | 'separator' | 'indicator';
    text: string;
    role: ConversationMessage['role'] | null;
    timestamp?: string;
    spans?: MarkdownPreviewSpan[];
}

export interface PreviewViewport {
    rows: PreviewViewportRow[];
    clampedOffset: number;
    maxOffset: number;
    hasAbove: boolean;
    hasBelow: boolean;
}

export function buildPreviewRows(messages: ConversationMessage[], contentWidth = 80): PreviewViewportRow[] {
    return messages.flatMap<PreviewViewportRow>((msg, index) => {
        const contentRows = renderMarkdownRows(msg.content, contentWidth);
        return [
            ...(index > 0 ? [{ kind: 'separator' as const, text: '', role: null }] : []),
            { kind: 'header', text: '', role: msg.role, timestamp: msg.timestamp },
            ...contentRows.map<PreviewViewportRow>(spans => ({
                kind: 'content',
                text: spans.map(span => span.text).join(''),
                role: msg.role,
                spans,
            })),
        ];
    });
}

export function countPreviewRows(messages: ConversationMessage[], contentWidth = 80): number {
    return buildPreviewRows(messages, contentWidth).length;
}

export function adjustPreviewScrollOffsetForAppendedRows(
    previousRowCount: number,
    currentRowCount: number,
    requestedOffset: number,
): number {
    if (requestedOffset <= 0 || currentRowCount <= previousRowCount) return requestedOffset;
    return requestedOffset + currentRowCount - previousRowCount;
}

export function buildPreviewViewportFromRows(
    rows: PreviewViewportRow[],
    maxLines: number,
    requestedOffset: number,
): PreviewViewport {
    const budget = Math.max(1, Math.floor(maxLines));
    const contentBudget = rows.length > budget ? Math.max(1, budget - 1) : budget;
    const maxOffset = Math.max(0, rows.length - contentBudget);
    const clampedOffset = Math.min(Math.max(0, Math.floor(requestedOffset)), maxOffset);
    const end = Math.max(0, rows.length - clampedOffset);
    const start = Math.max(0, end - contentBudget);
    const hasAbove = start > 0;
    const hasBelow = end < rows.length;
    const firstVisible = rows[start];
    const continuation = hasAbove && firstVisible?.kind === 'content' && firstVisible.role
        ? ` · ${firstVisible.role} continued`
        : '';
    const indicator: PreviewViewportRow[] = hasAbove || hasBelow
        ? [{
            kind: 'indicator',
            text: `${hasAbove ? '↑ older' : '       '}${continuation}${hasBelow ? ' ↓ newer' : ''}`,
            role: null,
        }]
        : [];
    return {
        rows: [...indicator, ...rows.slice(start, end)],
        clampedOffset,
        maxOffset,
        hasAbove,
        hasBelow,
    };
}

export function buildPreviewViewport(
    messages: ConversationMessage[],
    maxLines: number,
    requestedOffset: number,
    contentWidth = 80,
): PreviewViewport {
    return buildPreviewViewportFromRows(buildPreviewRows(messages, contentWidth), maxLines, requestedOffset);
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
    contentWidth = 80,
    onScrollOffsetClamp,
}) => {
    const activityActive = agent?.status === AgentStatus.RUNNING;
    const bodyMaxLines = Math.max(1, maxLines - (activityActive ? 1 : 0));
    const rows = useMemo(() => buildPreviewRows(messages, contentWidth), [messages, contentWidth]);
    const rowCount = rows.length;
    const previousRowCountRef = useRef(rowCount);
    const adjustedScrollOffset = adjustPreviewScrollOffsetForAppendedRows(
        previousRowCountRef.current,
        rowCount,
        scrollOffset,
    );
    const viewport = rows.length > 0
        ? buildPreviewViewportFromRows(rows, bodyMaxLines, adjustedScrollOffset)
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
                    row.kind === 'indicator' ? (
                        <Box key={idx}>
                            <Text dimColor>{row.text}</Text>
                        </Box>
                    ) : row.kind === 'header' && row.role ? (
                        <Box key={idx}>
                            {row.timestamp ? <Text dimColor>[{new Date(row.timestamp).toLocaleTimeString()}] </Text> : null}
                            <Text color={ROLE_COLOR[row.role]} bold>{row.role}:</Text>
                        </Box>
                    ) : row.kind === 'separator' ? (
                        <Box key={idx}>
                            <Text> </Text>
                        </Box>
                    ) : (
                        <Box key={idx}>
                            <Text>  </Text>
                            <Box flexGrow={1}>
                                <Text>
                                    {row.spans
                                        ? row.text
                                            ? row.spans.map((span, spanIndex) => (
                                                <Text
                                                    key={spanIndex}
                                                    bold={span.bold}
                                                    italic={span.italic}
                                                    dimColor={span.dimColor}
                                                    color={span.color}
                                                >
                                                    {span.text}
                                                </Text>
                                            ))
                                            : ' '
                                        : row.text || ' '}
                                </Text>
                            </Box>
                        </Box>
                    )
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
            <PreviewActivityIndicator active={activityActive} />
        </Box>
    );
};

export const PreviewPane = React.memo(PreviewPaneInner);
