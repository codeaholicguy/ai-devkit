import React from 'react';
import { Box, Text } from 'ink';
import { AgentStatus, type AgentInfo } from '@ai-devkit/agent-manager';

interface StatusFooterProps {
    agents: AgentInfo[];
    selected: AgentInfo | null;
    lastUpdated: Date | null;
    isLoading: boolean;
    narrowNote: string | null;
    transient: { kind: 'info' | 'error'; text: string } | null;
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

const StatusFooterInner: React.FC<StatusFooterProps> = ({
    agents,
    selected,
    lastUpdated,
    isLoading,
    narrowNote,
    transient,
}) => {
    const counts: Record<AgentStatus, number> = {
        [AgentStatus.RUNNING]: 0,
        [AgentStatus.WAITING]: 0,
        [AgentStatus.IDLE]: 0,
        [AgentStatus.UNKNOWN]: 0,
    };
    for (const a of agents) counts[a.status] = (counts[a.status] ?? 0) + 1;

    const summary = [
        `${counts[AgentStatus.RUNNING]} run`,
        `${counts[AgentStatus.WAITING]} wait`,
        `${counts[AgentStatus.IDLE]} idle`,
    ].join(' · ');

    const updated = isLoading && !lastUpdated
        ? 'loading…'
        : `updated ${lastUpdated ? formatRelative(lastUpdated) : '—'}`;

    return (
        <Box flexDirection="column">
            <Box>
                <Text dimColor>
                    {summary}{'  ·  '}{updated}{'  ·  '}↑/↓ nav · ⏎ open · i message · q quit
                </Text>
            </Box>
            {selected ? (
                <Box>
                    <Text dimColor>
                        sel: {selected.name} · {selected.projectPath} · {selected.status}
                    </Text>
                </Box>
            ) : null}
            {narrowNote ? (
                <Box>
                    <Text color="yellow">{narrowNote}</Text>
                </Box>
            ) : null}
            {transient ? (
                <Box>
                    <Text color={transient.kind === 'error' ? 'red' : 'cyan'}>{transient.text}</Text>
                </Box>
            ) : null}
        </Box>
    );
};

export const StatusFooter = React.memo(StatusFooterInner);
