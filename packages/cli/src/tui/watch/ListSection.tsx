import React from 'react';
import { Box } from 'ink';
import { AgentListPane } from './AgentListPane.js';
import { useWatchContext } from './state/WatchContext.js';

interface ListSectionProps {
    selectedName: string | null;
    onSelect: (name: string | null) => void;
    focused: boolean;
    width: number;
    height: number;
}

const ListSectionInner: React.FC<ListSectionProps> = ({ selectedName, onSelect, focused, width, height }) => {
    const { agents, error } = useWatchContext();
    return (
        <Box
            width={width}
            height={height}
            borderStyle="round"
            borderColor={focused ? 'cyan' : 'gray'}
            paddingX={1}
            flexDirection="column"
        >
            <AgentListPane
                agents={agents}
                selectedName={selectedName}
                onSelect={onSelect}
                width={width - 4}
                error={error}
                focused={focused}
            />
        </Box>
    );
};

export const ListSection = React.memo(ListSectionInner);
