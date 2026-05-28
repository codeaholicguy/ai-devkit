import React from 'react';
import { Text } from 'ink';
import { AgentStatus } from '@ai-devkit/agent-manager';

interface StatusGlyph {
    glyph: string;
    label: string;
    color: 'green' | 'yellow' | 'gray' | 'red';
}

const STATUS_DISPLAY: Record<AgentStatus, StatusGlyph> = {
    [AgentStatus.RUNNING]: { glyph: '●', label: 'run', color: 'green' },
    [AgentStatus.WAITING]: { glyph: '◐', label: 'wait', color: 'yellow' },
    [AgentStatus.IDLE]: { glyph: '○', label: 'idle', color: 'gray' },
    [AgentStatus.UNKNOWN]: { glyph: '?', label: 'unk', color: 'red' },
};

export interface FormatStatusProps {
    status: AgentStatus;
}

const FormatStatusInner: React.FC<FormatStatusProps> = ({ status }) => {
    const { glyph, label, color } = STATUS_DISPLAY[status] ?? STATUS_DISPLAY[AgentStatus.UNKNOWN];
    return <Text color={color}>{glyph} {label}</Text>;
};

export const FormatStatus = React.memo(FormatStatusInner);
