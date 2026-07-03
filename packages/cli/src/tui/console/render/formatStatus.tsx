import React from 'react';
import { Text } from 'ink';
import { AgentStatus } from '@ai-devkit/agent-manager';
import { TUI_STATUS_LABELS } from '../../design-system/index.js';

interface StatusGlyph {
    glyph: string;
    label: string;
    color: 'green' | 'yellow' | 'gray' | 'red';
}

const STATUS_DISPLAY: Record<AgentStatus, StatusGlyph> = {
    [AgentStatus.RUNNING]: TUI_STATUS_LABELS.running,
    [AgentStatus.WAITING]: TUI_STATUS_LABELS.waiting,
    [AgentStatus.IDLE]: TUI_STATUS_LABELS.idle,
    [AgentStatus.UNKNOWN]: TUI_STATUS_LABELS.unknown,
};

export interface FormatStatusProps {
    status: AgentStatus;
}

export function getStatusDisplay(status: AgentStatus): StatusGlyph {
    return STATUS_DISPLAY[status] ?? STATUS_DISPLAY[AgentStatus.UNKNOWN];
}

const FormatStatusInner: React.FC<FormatStatusProps> = ({ status }) => {
    const { glyph, label, color } = getStatusDisplay(status);
    return <Text color={color}>{glyph} {label}</Text>;
};

export const FormatStatus = React.memo(FormatStatusInner);
