import React, { useMemo } from 'react';
import { PreviewPane } from './PreviewPane.js';
import { useConsoleContext } from './state/ConsoleContext.js';
import { useAgentConversation } from './hooks/useAgentConversation.js';
import { Panel } from '../design-system/index.js';
import { getPreviewPanelTone } from './PreviewPane.js';

interface PreviewSectionProps {
    selectedName: string | null;
    height: number;
}

const PreviewSectionInner: React.FC<PreviewSectionProps> = ({ selectedName, height }) => {
    const { agents, manager, inputFocused, channelStatuses } = useConsoleContext();
    const selectedAgent = useMemo(
        () => agents.find(a => a.name === selectedName) ?? null,
        [agents, selectedName],
    );
    const { messages, error, isLoading } = useAgentConversation({
        manager,
        agent: selectedAgent,
        paused: inputFocused,
    });

    const channelStatus = selectedAgent ? channelStatuses[selectedAgent.name] : undefined;

    return (
        <Panel
            height={height}
            paddingX={1}
            flexDirection="column"
            flexShrink={0}
            tone={getPreviewPanelTone(channelStatus)}
        >
            <PreviewPane
                agent={selectedAgent}
                messages={messages}
                error={error}
                isLoading={isLoading}
                maxLines={Math.max(4, height - 2)}
                channelStatus={channelStatus}
            />
        </Panel>
    );
};

export const PreviewSection = React.memo(PreviewSectionInner);
