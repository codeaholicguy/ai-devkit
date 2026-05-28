import { memo, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface ChatInputProps {
    focused: boolean;
    value: string;
    onChange: (value: string) => void;
    onSubmit: (text: string) => void;
    onCancel: () => void;
    /** Inner width available for text content (after borders + padding + "> "). */
    innerWidth: number;
    /** Called with the rendered line count whenever it changes. */
    onLineCountChange: (lines: number) => void;
}

const MIN_LINES = 1;
const MAX_LINES = 6;

function computeLines(value: string, usableWidth: number): number {
    if (usableWidth <= 0) return MIN_LINES;
    const len = Math.max(1, value.length + 1);
    return Math.min(MAX_LINES, Math.max(MIN_LINES, Math.ceil(len / usableWidth)));
}

const ChatInputInner: FC<ChatInputProps> = ({
    focused,
    value,
    onChange,
    onSubmit,
    onCancel,
    innerWidth,
    onLineCountChange,
}) => {
    const lastLinesRef = useRef(MIN_LINES);
    const onLineCountChangeRef = useRef(onLineCountChange);
    onLineCountChangeRef.current = onLineCountChange;

    useEffect(() => {
        const promptWidth = 2; // "> "
        const usable = Math.max(1, innerWidth - promptWidth);
        const lines = computeLines(value, usable);
        if (lines !== lastLinesRef.current) {
            lastLinesRef.current = lines;
            onLineCountChangeRef.current(lines);
        }
    }, [value, innerWidth]);

    const handleSubmit = (text: string): void => {
        const trimmed = text.trim();
        onChange('');
        if (trimmed.length === 0) {
            onCancel();
            return;
        }
        onSubmit(trimmed);
    };

    if (!focused) {
        return (
            <Box>
                <Text dimColor>{'> '}</Text>
                <Text dimColor>press i to type a message</Text>
            </Box>
        );
    }

    return (
        <Box>
            <Text color="cyan" bold>{'> '}</Text>
            <TextInput
                value={value}
                onChange={onChange}
                onSubmit={handleSubmit}
                placeholder="type a message · ⏎ send · esc cancel"
            />
        </Box>
    );
};

export const ChatInput = memo(ChatInputInner);
