import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CONSOLE_POLL_INTERVAL_MS,
    CONSOLE_POLL_PHASE_MS,
    schedulePeriodicRefresh,
} from '../../../../tui/console/hooks/pollSchedule.js';

describe('console poll schedule', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('separates recurring refresh phases while preserving each source cadence', async () => {
        const calls: Array<{ source: string; time: number }> = [];
        const cleanups = Object.entries(CONSOLE_POLL_PHASE_MS).map(([source, phaseMs]) => (
            schedulePeriodicRefresh(
                () => { calls.push({ source, time: Date.now() }); },
                CONSOLE_POLL_INTERVAL_MS,
                phaseMs,
            )
        ));

        await vi.advanceTimersByTimeAsync(CONSOLE_POLL_INTERVAL_MS * 2);

        expect(calls).toEqual([
            { source: 'selectedAgentPreview', time: 750 },
            { source: 'channelStatus', time: 1500 },
            { source: 'configuredChannels', time: 2250 },
            { source: 'agentList', time: 3000 },
            { source: 'selectedAgentPreview', time: 3750 },
            { source: 'channelStatus', time: 4500 },
            { source: 'configuredChannels', time: 5250 },
            { source: 'agentList', time: 6000 },
        ]);

        for (const source of Object.keys(CONSOLE_POLL_PHASE_MS)) {
            const times = calls.filter(call => call.source === source).map(call => call.time);
            expect(times[1] - times[0]).toBe(CONSOLE_POLL_INTERVAL_MS);
        }

        cleanups.forEach(cleanup => cleanup());
    });

    it('cancels both pending phase starts and active intervals', async () => {
        const beforeStart = vi.fn();
        const stopBeforeStart = schedulePeriodicRefresh(
            beforeStart,
            CONSOLE_POLL_INTERVAL_MS,
            CONSOLE_POLL_PHASE_MS.configuredChannels,
        );
        stopBeforeStart();

        const afterStart = vi.fn();
        const stopAfterStart = schedulePeriodicRefresh(
            afterStart,
            CONSOLE_POLL_INTERVAL_MS,
            CONSOLE_POLL_PHASE_MS.selectedAgentPreview,
        );
        await vi.advanceTimersByTimeAsync(CONSOLE_POLL_PHASE_MS.selectedAgentPreview);
        expect(afterStart).toHaveBeenCalledTimes(1);
        stopAfterStart();

        await vi.advanceTimersByTimeAsync(CONSOLE_POLL_INTERVAL_MS * 2);

        expect(beforeStart).not.toHaveBeenCalled();
        expect(afterStart).toHaveBeenCalledTimes(1);
    });
});
