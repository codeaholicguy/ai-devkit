import React, { useEffect } from 'react';
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

export interface PreviewViewport {
    lines: string[];
    clampedOffset: number;
    maxOffset: number;
    hasAbove: boolean;
    hasBelow: boolean;
}

export function buildPreviewViewport(
    messages: ConversationMessage[],
    maxLines: number,
    requestedOffset: number,
): PreviewViewport {
    const budget = Math.max(1, Math.floor(maxLines));
    const lines = messages.flatMap((msg) => {
        const contentLines = msg.content.split('\n');
        const first = contentLines[0] ?? '';
        return [
            `${msg.role}: ${first}`,
            ...contentLines.slice(1).map(line => `  ${line}`),
        ];
    });
    const maxOffset = Math.max(0, lines.length - budget);
    const clampedOffset = Math.min(Math.max(0, Math.floor(requestedOffset)), maxOffset);
    const end = Math.max(0, lines.length - clampedOffset);
    const start = Math.max(0, end - budget);
    return {
        lines: lines.slice(start, end),
        clampedOffset,
        maxOffset,
        hasAbove: start > 0,
        hasBelow: end < lines.length,
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

function getLineColor(line: string): 'green' | 'cyan' | 'yellow' | undefined {
    if (line.startsWith('user:')) return ROLE_COLOR.user;
    if (line.startsWith('assistant:')) return ROLE_COLOR.assistant;
    if (line.startsWith('system:')) return ROLE_COLOR.system;
    return undefined;
}

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
    const viewport = messages.length > 0
        ? buildPreviewViewport(messages, Math.max(4, maxLines), scrollOffset)
        : null;
    const clampedOffset = viewport?.clampedOffset;

    useEffect(() => {
        if (clampedOffset !== undefined && clampedOffset !== scrollOffset) {
            onScrollOffsetClamp?.(clampedOffset);
        }
    }, [onScrollOffsetClamp, scrollOffset, clampedOffset]);

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
                {viewport && (viewport.hasAbove || viewport.hasBelow) ? (
                    <Box>
                        <Text dimColor>{viewport.hasAbove ? '↑ older' : '       '}</Text>
                        <Text dimColor>{viewport.hasBelow ? ' ↓ newer' : ''}</Text>
                    </Box>
                ) : null}
                {viewport?.lines.map((line, idx) => (
                    <Box key={idx}>
                        <Text color={getLineColor(line)}>{line}</Text>
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
