export type ConsoleAction =
    | { type: 'open'; agentName: string }
    | { type: 'send'; agentName: string; message: string };
