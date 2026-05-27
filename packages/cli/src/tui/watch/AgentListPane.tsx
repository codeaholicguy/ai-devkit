import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo } from '@ai-devkit/agent-manager';
import { FormatStatus } from './render/formatStatus.js';

interface AgentListPaneProps {
    agents: AgentInfo[];
    selectedName: string | null;
    onSelect: (name: string | null) => void;
    width?: number;
    error?: string | null;
    focused?: boolean;
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

// Fixed column widths inside each row (excluding outer marker).
const MARKER_W = 2;  // "▶ " or "  "
const STATUS_W = 7;  // "● run  " — glyph(1) + space(1) + label(4) + trailing space(1)
const ROW_CHROME = MARKER_W + STATUS_W;

interface AgentRowProps {
    agent: AgentInfo;
    isSelected: boolean;
    innerWidth: number;
}

const AgentRow: React.FC<AgentRowProps> = ({ agent, isSelected, innerWidth }) => {
    const nameW = Math.max(4, innerWidth - ROW_CHROME);
    const summaryW = Math.max(4, innerWidth - MARKER_W);  // summary indented by marker only

    const rawSummary = agent.summary?.trim()
        ? agent.summary
        : shortPath(agent.projectPath);
    const summary = clip(rawSummary, summaryW);
    const name = clip(agent.name, nameW);

    const accent = isSelected ? 'cyan' : undefined;

    return (
        <Box flexDirection="column" width={innerWidth}>
            {/* Line 1: marker · status · name */}
            <Box flexDirection="row" width={innerWidth}>
                <Box width={MARKER_W} flexShrink={0}>
                    <Text color={accent}>{isSelected ? '▶ ' : '  '}</Text>
                </Box>
                <Box width={STATUS_W} flexShrink={0}>
                    <FormatStatus status={agent.status} />
                </Box>
                <Box width={nameW} flexShrink={0} overflow="hidden">
                    <Text color={accent} bold={isSelected}>{name}</Text>
                </Box>
            </Box>
            {/* Line 2: summary / project path, indented under status */}
            <Box flexDirection="row" width={innerWidth}>
                <Box width={MARKER_W} flexShrink={0} />
                <Box width={summaryW} flexShrink={0} overflow="hidden">
                    <Text dimColor>{summary}</Text>
                </Box>
            </Box>
        </Box>
    );
};

const AgentListPaneInner: React.FC<AgentListPaneProps> = ({
    agents,
    selectedName,
    onSelect,
    width,
    error,
}) => {
    useEffect(() => {
        if (agents.length === 0) {
            if (selectedName !== null) onSelect(null);
            return;
        }
        const exists = agents.some(a => a.name === selectedName);
        if (!exists) onSelect(agents[0].name);
    }, [agents, selectedName, onSelect]);

    const innerWidth = Math.max(16, width ?? 44);

    if (error && agents.length === 0) {
        return (
            <Box flexDirection="column" width={innerWidth}>
                <Text bold>AGENTS</Text>
                <Text color="red">{clip(error, innerWidth)}</Text>
            </Box>
        );
    }

    if (agents.length === 0) {
        return (
            <Box flexDirection="column" width={innerWidth}>
                <Text bold>AGENTS</Text>
                <Text dimColor>No running agents.</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" width={innerWidth}>
            <Box width={innerWidth} marginBottom={1}>
                <Text bold>AGENTS </Text><Text dimColor>({agents.length})</Text>
            </Box>
            {agents.map((agent) => (
                <AgentRow
                    key={agent.name}
                    agent={agent}
                    isSelected={agent.name === selectedName}
                    innerWidth={innerWidth}
                />
            ))}
        </Box>
    );
};

export const AgentListPane = React.memo(AgentListPaneInner);
