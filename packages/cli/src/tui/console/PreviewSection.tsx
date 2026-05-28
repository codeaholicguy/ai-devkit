import React, { useMemo } from 'react';
import { Box } from 'ink';
import { PreviewPane } from './PreviewPane.js';
import { useConsoleContext } from './state/ConsoleContext.js';
import { useAgentConversation } from './hooks/useAgentConversation.js';

interface PreviewSectionProps {
    selectedName: string | null;
    height: number;
}

const PreviewSectionInner: React.FC<PreviewSectionProps> = ({ selectedName, height }) => {
    const { agents, manager, inputFocused } = useConsoleContext();
    const selectedAgent = useMemo(
        () => agents.find(a => a.name === selectedName) ?? null,
        [agents, selectedName],
    );
    const { messages, error, isLoading } = useAgentConversation({
        manager,
        agent: selectedAgent,
        paused: inputFocused,
    });

    return (
        <Box
            height={height}
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
            flexDirection="column"
            flexShrink={0}
        >
            <PreviewPane
                agent={selectedAgent}
                messages={messages}
                error={error}
                isLoading={isLoading}
                maxLines={Math.max(4, height - 2)}
            />
        </Box>
    );
};

export const PreviewSection = React.memo(PreviewSectionInner);
