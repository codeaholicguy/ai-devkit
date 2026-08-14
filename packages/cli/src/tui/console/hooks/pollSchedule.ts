export const CONSOLE_POLL_INTERVAL_MS = 3000;

export const CONSOLE_POLL_PHASE_MS = {
    agentList: 0,
    selectedAgentPreview: 750,
    channelStatus: 1500,
    configuredChannels: 2250,
} as const;

export function schedulePeriodicRefresh(
    refresh: () => void,
    intervalMs: number,
    phaseMs: number,
): () => void {
    const normalizedPhaseMs = ((phaseMs % intervalMs) + intervalMs) % intervalMs;
    const elapsedInPeriodMs = Date.now() % intervalMs;
    const timeUntilPhaseMs = (normalizedPhaseMs - elapsedInPeriodMs + intervalMs) % intervalMs;
    const initialDelayMs = timeUntilPhaseMs === 0 ? intervalMs : timeUntilPhaseMs;
    let intervalHandle: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    const timeoutHandle = setTimeout(() => {
        if (stopped) return;
        refresh();
        intervalHandle = setInterval(refresh, intervalMs);
    }, initialDelayMs);

    return () => {
        stopped = true;
        clearTimeout(timeoutHandle);
        if (intervalHandle !== undefined) clearInterval(intervalHandle);
    };
}
