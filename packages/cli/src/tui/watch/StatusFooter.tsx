import React from 'react';
import { Box, Text } from 'ink';
import { AgentStatus, type AgentInfo } from '@ai-devkit/agent-manager';
import { formatRelative } from './render/formatRelative.js';

interface StatusFooterProps {
    agents: AgentInfo[];
    lastUpdated: Date | null;
    isLoading: boolean;
    narrowNote: string | null;
    transient: { kind: 'info' | 'error'; text: string } | null;
}

const StatusFooterInner: React.FC<StatusFooterProps> = ({
    agents,
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
                    {summary}{'  ·  '}{updated}{'  ·  '}j/k nav · o open · i message · q quit
                </Text>
            </Box>
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
