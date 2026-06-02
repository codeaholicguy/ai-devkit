import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { KeyHints, Panel, SectionTitle, TUI_COLORS } from '../design-system/index.js';

type Focus = 'name' | 'submit' | 'cancel';

interface RenameAgentPaneProps {
    currentName: string;
    initialName: string;
    onSubmit: (values: { newName: string }) => void;
    onCancel: () => void;
    error?: string | null;
    isSubmitting?: boolean;
    width: number;
    height: number;
}

interface RenameAgentValues {
    newName: string;
}

const FOCUS_ORDER: Focus[] = ['name', 'submit', 'cancel'];
const RENAME_KEY_HINTS = ['tab move', 'esc back'];

function nextFocus(focus: Focus): Focus {
    return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) + 1) % FOCUS_ORDER.length];
}

function previousFocus(focus: Focus): Focus {
    return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length];
}

export function normalizeRenameAgentValues(values: RenameAgentValues): RenameAgentValues {
    return { newName: values.newName.trim() };
}

export function trimRenameAgentError(error: string, width: number): string {
    const max = Math.max(20, width - 6);
    return error.length > max ? `${error.slice(0, max - 1)}...` : error;
}

export const RenameAgentPane: React.FC<RenameAgentPaneProps> = ({
    currentName,
    initialName,
    onSubmit,
    onCancel,
    error = null,
    isSubmitting = false,
    width,
    height,
}) => {
    const [newName, setNewName] = useState(initialName);
    const [focus, setFocus] = useState<Focus>('name');

    const submit = (): void => {
        if (isSubmitting) return;
        onSubmit(normalizeRenameAgentValues({ newName }));
    };

    useInput((input, key) => {
        if (isSubmitting) return;
        if (key.escape || input === '\u001b') {
            onCancel();
            return;
        }

        if (key.tab || key.downArrow) {
            setFocus(nextFocus(focus));
            return;
        }
        if (key.upArrow) {
            setFocus(previousFocus(focus));
            return;
        }

        if (key.return) {
            if (focus === 'submit') {
                submit();
            } else if (focus === 'cancel') {
                onCancel();
            } else {
                setFocus('submit');
            }
        }
    });

    const innerWidth = Math.max(24, width - 4);

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
                <SectionTitle>RENAME AGENT</SectionTitle>
                {isSubmitting ? <Text color={TUI_COLORS.accent}> renaming...</Text> : null}
            </Box>

            <Box marginTop={1} width={innerWidth}>
                <Text dimColor>Current: </Text>
                <Text>{currentName}</Text>
            </Box>

            <Box marginTop={1} width={innerWidth}>
                <Text color={focus === 'name' ? TUI_COLORS.accent : undefined}>New name: </Text>
                {focus === 'name' ? (
                    <TextInput value={newName} onChange={setNewName} onSubmit={() => setFocus('submit')} />
                ) : (
                    <Text>{newName}</Text>
                )}
            </Box>

            {error ? (
                <Box marginTop={1}>
                    <Text color={TUI_COLORS.danger}>{trimRenameAgentError(error, width)}</Text>
                </Box>
            ) : null}

            <Box marginTop={1}>
                <Text inverse={focus === 'submit'} color={focus === 'submit' ? TUI_COLORS.accent : undefined}>
                    {isSubmitting ? ' Renaming ' : ' Rename '}
                </Text>
                <Text>  </Text>
                <Text inverse={focus === 'cancel'} color={focus === 'cancel' ? TUI_COLORS.accent : undefined}>
                    {' Cancel '}
                </Text>
                <Text>  </Text>
                <KeyHints hints={RENAME_KEY_HINTS} />
            </Box>
        </Panel>
    );
};
