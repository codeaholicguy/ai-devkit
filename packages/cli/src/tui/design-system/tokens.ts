export const TUI_COLORS = {
    accent: 'cyan',
    border: 'gray',
    danger: 'red',
    warning: 'yellow',
    success: 'green',
} as const;

export const TUI_KEY_HINT_SEPARATOR = ' · ';

export const TUI_STATUS_LABELS = {
    running: { glyph: '●', label: 'run', color: TUI_COLORS.success },
    waiting: { glyph: '◐', label: 'wait', color: TUI_COLORS.warning },
    idle: { glyph: '○', label: 'idle', color: TUI_COLORS.border },
    unknown: { glyph: '?', label: 'unk', color: TUI_COLORS.danger },
} as const;

export type PanelTone = 'default' | 'danger' | 'success';

export function getPanelBorderColor(focused: boolean, tone: PanelTone = 'default'): string {
    if (tone === 'danger') return TUI_COLORS.danger;
    if (tone === 'success') return TUI_COLORS.success;
    return focused ? TUI_COLORS.accent : TUI_COLORS.border;
}

export function formatKeyHints(hints: string[]): string {
    return hints.join(TUI_KEY_HINT_SEPARATOR);
}
