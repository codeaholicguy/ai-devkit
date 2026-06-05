import React from 'react';
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
}

const ROLE_COLOR: Record<ConversationMessage['role'], 'green' | 'cyan' | 'yellow'> = {
    user: TUI_COLORS.success,
    assistant: TUI_COLORS.accent,
    system: TUI_COLORS.warning,
};


function formatTime(ts: string | undefined): string {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleTimeString();
    } catch {
        return '';
    }
}

function shortPath(p: string): string {
    const home = process.env.HOME ?? '';
    if (home && p.startsWith(home)) return '~' + p.slice(home.length);
    return p;
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
}) => {
    if (!agent) {
        return (
            <Box flexDirection="column">
                <SectionTitle>PREVIEW</SectionTitle>
                <Text dimColor>No agent selected.</Text>
            </Box>
        );
    }

    const messageBudget = Math.max(4, maxLines);

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
        const rendered: React.ReactNode[] = [];
        let usedLines = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const contentLines = msg.content.split('\n');
            const headerLine = 1;
            if (usedLines + headerLine > messageBudget) break;
            const remaining = messageBudget - usedLines - headerLine;
            const trimmed = contentLines.length > remaining
                ? [...contentLines.slice(0, Math.max(0, remaining - 1)), `… (${contentLines.length - Math.max(0, remaining - 1)} more lines)`]
                : contentLines;
            const time = formatTime(msg.timestamp);
            rendered.unshift(
                <Box key={i} flexDirection="column" marginBottom={1}>
                    <Box flexDirection="row">
                        {time ? <Text dimColor>[{time}] </Text> : null}
                        <Text color={ROLE_COLOR[msg.role]} bold>{msg.role}:</Text>
                    </Box>
                    {trimmed.map((line: string, idx: number) => (
                        <Box key={idx}>
                            <Text>  {line}</Text>
                        </Box>
                    ))}
                </Box>,
            );
            usedLines += headerLine + trimmed.length + 1;
            if (usedLines >= messageBudget) break;
        }
        body = <>{rendered}</>;
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
