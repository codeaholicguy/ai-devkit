export type ConsoleFocus = 'list' | 'input';

export type RightPaneMode =
    | { type: 'preview' }
    | { type: 'start-agent' }
    | { type: 'rename-agent'; agentName: string }
    | { type: 'help' };

export type TransientMessage = { kind: 'info' | 'error'; text: string };
