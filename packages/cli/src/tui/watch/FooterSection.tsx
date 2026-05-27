import React from 'react';
import { StatusFooter } from './StatusFooter.js';
import { useWatchContext } from './state/WatchContext.js';

interface FooterSectionProps {
    selectedName: string | null;
    narrowNote: string | null;
    transient: { kind: 'info' | 'error'; text: string } | null;
}

const FooterSectionInner: React.FC<FooterSectionProps> = ({ selectedName, narrowNote, transient }) => {
    const { agents, lastUpdated, isLoading } = useWatchContext();
    const selected = agents.find(a => a.name === selectedName) ?? null;
    return (
        <StatusFooter
            agents={agents}
            selected={selected}
            lastUpdated={lastUpdated}
            isLoading={isLoading}
            narrowNote={narrowNote}
            transient={transient}
        />
    );
};

export const FooterSection = React.memo(FooterSectionInner);
