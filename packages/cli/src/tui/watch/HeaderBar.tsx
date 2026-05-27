import React from 'react';
import { Box, Text } from 'ink';
import { useWatchContext } from './state/WatchContext.js';

const HeaderBarInner: React.FC = () => {
    const { agents, isLoading } = useWatchContext();
    const totalLabel = isLoading && agents.length === 0 ? 'scanning…' : `${agents.length} agent${agents.length === 1 ? '' : 's'}`;
    return (
        <Box paddingX={1}>
            <Text bold color="cyan">ai-devkit</Text>
            <Text dimColor> · </Text>
            <Text>agent watch</Text>
            <Text dimColor>   {totalLabel}</Text>
        </Box>
    );
};

export const HeaderBar = React.memo(HeaderBarInner);
