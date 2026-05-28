import React from 'react';
import { Box, Text } from 'ink';
import { useConsoleContext } from './state/ConsoleContext.js';

const HeaderBarInner: React.FC = () => {
    const { agents, isLoading } = useConsoleContext();
    const totalLabel = isLoading && agents.length === 0 ? 'scanning…' : `${agents.length} agent${agents.length === 1 ? '' : 's'}`;
    return (
        <Box paddingX={1}>
            <Text bold color="cyan">ai-devkit</Text>
            <Text dimColor> · </Text>
            <Text>agent console</Text>
            <Text dimColor>   {totalLabel}</Text>
        </Box>
    );
};

export const HeaderBar = React.memo(HeaderBarInner);
