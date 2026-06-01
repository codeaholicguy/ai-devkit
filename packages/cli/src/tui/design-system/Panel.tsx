import React from 'react';
import { Box } from 'ink';
import { getPanelBorderColor, type PanelTone } from './tokens.js';

type BoxProps = React.ComponentProps<typeof Box>;

interface PanelProps extends Omit<BoxProps, 'borderColor' | 'borderStyle'> {
    focused?: boolean;
    tone?: PanelTone;
}

export const Panel: React.FC<PanelProps> = ({
    focused = false,
    tone = 'default',
    children,
    ...props
}) => (
    <Box
        borderStyle="round"
        borderColor={getPanelBorderColor(focused, tone)}
        {...props}
    >
        {children}
    </Box>
);
