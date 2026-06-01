import React from 'react';
import { Text } from 'ink';
import { formatKeyHints } from './tokens.js';

interface KeyHintsProps {
    hints: string[];
}

export const KeyHints: React.FC<KeyHintsProps> = ({ hints }) => (
    <Text dimColor>{formatKeyHints(hints)}</Text>
);
