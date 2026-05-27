export type WatchAction =
    | { type: 'open'; agentName: string }
    | { type: 'send'; agentName: string; message: string };
