import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { TUI_COLORS } from '../design-system/index.js';

interface PreviewActivityIndicatorProps {
    active: boolean;
}

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'] as const;
const ASCII_FRAMES = ['|', '/', '-', '\\'] as const;

export function getPreviewActivityFrame(frameIndex: number, term = process.env.TERM): string {
    const frames = term === 'dumb' ? ASCII_FRAMES : BRAILLE_FRAMES;
    return frames[frameIndex % frames.length];
}

const PreviewActivityIndicatorInner: React.FC<PreviewActivityIndicatorProps> = ({ active }) => {
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        if (!active) {
            setFrameIndex(0);
            return;
        }

        setFrameIndex(0);
        const handle = setInterval(() => {
            setFrameIndex(current => current + 1);
        }, 160);

        return () => clearInterval(handle);
    }, [active]);

    if (!active) return null;

    return (
        <Box>
            <Text color={TUI_COLORS.accent}>{getPreviewActivityFrame(frameIndex)}</Text>
            <Text dimColor> working</Text>
        </Box>
    );
};

export const PreviewActivityIndicator = React.memo(PreviewActivityIndicatorInner);
