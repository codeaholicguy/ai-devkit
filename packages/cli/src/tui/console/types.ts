export type ConsoleFocus = 'list' | 'input';

export type RightPaneMode = { type: 'preview' } | { type: 'start-agent' } | { type: 'help' };

export type TransientMessage = { kind: 'info' | 'error'; text: string };
