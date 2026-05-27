import React from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, ConversationMessage } from '@ai-devkit/agent-manager';
import type { ConversationFetchError } from './hooks/useAgentConversation.js';

interface PreviewPaneProps {
    agent: AgentInfo | null;
    messages: ConversationMessage[];
    error: ConversationFetchError | null;
    isLoading: boolean;
    maxLines?: number;
}

const ROLE_COLOR: Record<ConversationMessage['role'], 'green' | 'cyan' | 'yellow'> = {
    user: 'green',
    assistant: 'cyan',
    system: 'yellow',
};

const TYPE_LABEL: Record<string, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini_cli: 'Gemini',
    opencode: 'OpenCode',
};

function formatTime(ts: string | undefined): string {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleTimeString();
    } catch {
        return '';
    }
}

function formatRelative(date: Date | string | undefined): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    const diffMs = Date.now() - d.getTime();
    const sec = Math.max(0, Math.floor(diffMs / 1000));
    if (sec < 5) return 'now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}

function shortPath(p: string): string {
    const home = process.env.HOME ?? '';
    if (home && p.startsWith(home)) return '~' + p.slice(home.length);
    return p;
}

const MetadataHeader: React.FC<{ agent: AgentInfo }> = ({ agent }) => (
    <Box>
        <Text bold>PREVIEW</Text>
        <Text dimColor> · </Text>
        <Text color="cyan">{agent.name}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{TYPE_LABEL[agent.type] ?? agent.type}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{formatRelative(agent.lastActive)}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{shortPath(agent.projectPath)}</Text>
    </Box>
);

const PreviewPaneInner: React.FC<PreviewPaneProps> = ({
    agent,
    messages,
    error,
    isLoading,
    maxLines = 22,
}) => {
    if (!agent) {
        return (
            <Box flexDirection="column">
                <Text bold>PREVIEW</Text>
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
        body = <Text color="red">{detail}</Text>;
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
                    <Text>
                        {time ? <Text dimColor>[{time}] </Text> : null}
                        <Text color={ROLE_COLOR[msg.role]} bold>{msg.role}:</Text>
                    </Text>
                    {trimmed.map((line: string, idx: number) => (
                        <Text key={idx}>  {line}</Text>
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
            <MetadataHeader agent={agent} />
            <Box flexDirection="column" flexGrow={1}>
                {body}
            </Box>
        </Box>
    );
};

export const PreviewPane = React.memo(PreviewPaneInner);
