import React from 'react';
import { Text } from 'ink';

interface SectionTitleProps {
    children: string;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({ children }) => (
    <Text bold>{children}</Text>
);
