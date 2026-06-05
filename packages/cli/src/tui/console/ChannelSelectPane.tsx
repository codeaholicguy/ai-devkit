import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { KeyHints, Panel, SectionTitle, TUI_COLORS } from '../design-system/index.js';
import type { ConfiguredChannel } from './types.js';

interface ChannelSelectPaneProps {
    agentName: string;
    channels: ConfiguredChannel[];
    onSubmit: (channelName: string) => void;
    onCancel: () => void;
    isSubmitting?: boolean;
    error?: string | null;
    width: number;
    height: number;
}

interface ChannelSelectRow {
    marker: string;
    name: string;
    detail: string;
}

export function getChannelSelectRows(channels: ConfiguredChannel[], selectedName: string | null): ChannelSelectRow[] {
    return channels.map(channel => ({
        marker: channel.name === selectedName ? '▶ ' : '  ',
        name: channel.name,
        detail: [
            channel.type,
            channel.botUsername ? `@${channel.botUsername}` : null,
            channel.enabled ? 'enabled' : 'disabled',
        ].filter(Boolean).join(' '),
    }));
}

export const ChannelSelectPane: React.FC<ChannelSelectPaneProps> = ({
    agentName,
    channels,
    onSubmit,
    onCancel,
    isSubmitting = false,
    error = null,
    width,
    height,
}) => {
    const [selectedName, setSelectedName] = useState<string | null>(channels[0]?.name ?? null);

    useEffect(() => {
        if (!channels.length) {
            setSelectedName(null);
            return;
        }
        if (!selectedName || !channels.some(channel => channel.name === selectedName)) {
            setSelectedName(channels[0].name);
        }
    }, [channels, selectedName]);

    useInput((input, key) => {
        if (isSubmitting) return;
        if (key.escape || input === '\u001b') {
            onCancel();
            return;
        }
        if (!channels.length) return;
        if (key.downArrow || input === 'j') {
            const idx = Math.max(0, channels.findIndex(channel => channel.name === selectedName));
            setSelectedName(channels[(idx + 1) % channels.length].name);
            return;
        }
        if (key.upArrow || input === 'k') {
            const idx = Math.max(0, channels.findIndex(channel => channel.name === selectedName));
            setSelectedName(channels[(idx - 1 + channels.length) % channels.length].name);
            return;
        }
        if (key.return && selectedName) {
            onSubmit(selectedName);
        }
    });

    const innerWidth = Math.max(24, width - 4);
    const rows = getChannelSelectRows(channels, selectedName);

    return (
        <Panel
            width={width}
            height={height}
            focused
            paddingX={1}
            flexDirection="column"
            flexShrink={0}
        >
            <Box>
                <SectionTitle>START CHANNEL</SectionTitle>
                {isSubmitting ? <Text color={TUI_COLORS.accent}> starting...</Text> : null}
            </Box>

            <Box marginTop={1} width={innerWidth}>
                <Text dimColor>Agent: </Text>
                <Text>{agentName}</Text>
            </Box>

            <Box flexDirection="column" marginTop={1}>
                {rows.length ? rows.map(row => (
                    <Box key={row.name} width={innerWidth}>
                        <Text color={row.marker.trim() ? TUI_COLORS.accent : undefined}>{row.marker}</Text>
                        <Text color={row.marker.trim() ? TUI_COLORS.accent : undefined} bold={row.marker.trim().length > 0}>
                            {row.name}
                        </Text>
                        <Text dimColor>  {row.detail}</Text>
                    </Box>
                )) : (
                    <Text color={TUI_COLORS.warning}>No channels configured. Run channel connect first.</Text>
                )}
            </Box>

            {error ? (
                <Box marginTop={1}>
                    <Text color={TUI_COLORS.danger}>{error}</Text>
                </Box>
            ) : null}

            <Box marginTop={1}>
                <KeyHints hints={['j/k choose', 'enter start', 'esc back']} />
            </Box>
        </Panel>
    );
};
