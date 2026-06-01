import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { StartableAgentType } from '@ai-devkit/agent-manager';
import { KeyHints, Panel, SectionTitle, TUI_COLORS } from '../design-system/index.js';

export const STARTABLE_AGENT_TYPES: StartableAgentType[] = ['claude', 'codex', 'gemini_cli', 'opencode'];

export function nextStartAgentType(type: StartableAgentType): StartableAgentType {
    const index = STARTABLE_AGENT_TYPES.indexOf(type);
    return STARTABLE_AGENT_TYPES[(index + 1) % STARTABLE_AGENT_TYPES.length];
}

export function previousStartAgentType(type: StartableAgentType): StartableAgentType {
    const index = STARTABLE_AGENT_TYPES.indexOf(type);
    return STARTABLE_AGENT_TYPES[(index - 1 + STARTABLE_AGENT_TYPES.length) % STARTABLE_AGENT_TYPES.length];
}

type Focus = 'type' | 'cwd' | 'name' | 'submit' | 'cancel';

interface StartAgentPaneProps {
    initialType?: StartableAgentType;
    initialName: string;
    initialCwd: string;
    onSubmit: (values: { type: StartableAgentType; name: string; cwd: string }) => void;
    onCancel: () => void;
    error?: string | null;
    isSubmitting?: boolean;
    width: number;
    height: number;
}

interface StartAgentValues {
    type: StartableAgentType;
    name: string;
    cwd: string;
}

const FOCUS_ORDER: Focus[] = ['type', 'cwd', 'name', 'submit', 'cancel'];

function nextFocus(focus: Focus): Focus {
    return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) + 1) % FOCUS_ORDER.length];
}

function previousFocus(focus: Focus): Focus {
    return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length];
}

export function normalizeStartAgentValues(values: StartAgentValues): StartAgentValues {
    return {
        type: values.type,
        name: values.name.trim(),
        cwd: values.cwd.trim(),
    };
}

export function trimStartAgentError(error: string, width: number): string {
    const max = Math.max(20, width - 6);
    return error.length > max ? `${error.slice(0, max - 1)}...` : error;
}

export const StartAgentPane: React.FC<StartAgentPaneProps> = ({
    initialType = 'codex',
    initialName,
    initialCwd,
    onSubmit,
    onCancel,
    error = null,
    isSubmitting = false,
    width,
    height,
}) => {
    const [type, setType] = useState<StartableAgentType>(initialType);
    const [cwd, setCwd] = useState(initialCwd);
    const [name, setName] = useState(initialName);
    const [focus, setFocus] = useState<Focus>('type');

    const submit = (): void => {
        if (isSubmitting) return;
        onSubmit(normalizeStartAgentValues({ type, name, cwd }));
    };

    useInput((input, key) => {
        if (isSubmitting) return;
        if (key.escape || input === '\u001b') {
            onCancel();
            return;
        }

        if (focus === 'type') {
            if (key.leftArrow || input === 'h') {
                setType(previousStartAgentType(type));
                return;
            }
            if (key.rightArrow || input === 'l') {
                setType(nextStartAgentType(type));
                return;
            }
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
                setFocus(nextFocus(focus));
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
                <SectionTitle>START AN AGENT</SectionTitle>
                {isSubmitting ? <Text color={TUI_COLORS.accent}> starting...</Text> : null}
            </Box>

            <Box marginTop={1}>
                <Text color={focus === 'type' ? TUI_COLORS.accent : undefined}>Type: </Text>
                {STARTABLE_AGENT_TYPES.map((agentType) => (
                    <Text
                        key={agentType}
                        color={agentType === type ? TUI_COLORS.accent : undefined}
                        inverse={focus === 'type' && agentType === type}
                    >
                        {` ${agentType} `}
                    </Text>
                ))}
            </Box>

            <Box marginTop={1} width={innerWidth}>
                <Text color={focus === 'cwd' ? TUI_COLORS.accent : undefined}>Cwd: </Text>
                {focus === 'cwd' ? (
                    <TextInput value={cwd} onChange={setCwd} onSubmit={() => setFocus('name')} />
                ) : (
                    <Text>{cwd}</Text>
                )}
            </Box>

            <Box marginTop={1} width={innerWidth}>
                <Text color={focus === 'name' ? TUI_COLORS.accent : undefined}>Name: </Text>
                {focus === 'name' ? (
                    <TextInput value={name} onChange={setName} onSubmit={() => setFocus('submit')} />
                ) : (
                    <Text>{name}</Text>
                )}
            </Box>

            {error ? (
                <Box marginTop={1}>
                    <Text color={TUI_COLORS.danger}>{trimStartAgentError(error, width)}</Text>
                </Box>
            ) : null}

            <Box marginTop={1}>
                <Text inverse={focus === 'submit'} color={focus === 'submit' ? TUI_COLORS.accent : undefined}>
                    {isSubmitting ? ' Starting ' : ' Start '}
                </Text>
                <Text>  </Text>
                <Text inverse={focus === 'cancel'} color={focus === 'cancel' ? TUI_COLORS.accent : undefined}>
                    {' Cancel '}
                </Text>
                <Text>  </Text>
                <KeyHints hints={['tab move', 'esc back']} />
            </Box>
        </Panel>
    );
};
