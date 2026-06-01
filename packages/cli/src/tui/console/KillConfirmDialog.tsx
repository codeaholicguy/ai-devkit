import React from 'react';
import { Box, Text } from 'ink';

interface KillConfirmDialogProps {
    agentName: string;
    width?: number;
}

export const KillConfirmDialog: React.FC<KillConfirmDialogProps> = ({ agentName, width }) => (
    <Box
        borderStyle="round"
        borderColor="red"
        width={width}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
    >
        <Text color="red">Kill agent "{agentName}"?</Text>
        <Text dimColor>Enter/y confirm · Esc/n cancel</Text>
    </Box>
);
