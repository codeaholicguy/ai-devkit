import React from 'react';
import { Text } from 'ink';
import { KeyHints, Panel, TUI_COLORS } from '../design-system/index.js';

interface KillConfirmDialogProps {
    agentName: string;
    width?: number;
}

export const KillConfirmDialog: React.FC<KillConfirmDialogProps> = ({ agentName, width }) => (
    <Panel
        tone="danger"
        backgroundColor="black"
        width={width}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
    >
        <Text color={TUI_COLORS.danger}>Kill agent "{agentName}"?</Text>
        <KeyHints hints={['Enter/y confirm', 'Esc/n cancel']} />
    </Panel>
);
