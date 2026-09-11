import type { TmuxManager } from '../../terminal/TmuxManager.js';

export const DEFAULT_PID_POLL_INTERVAL_MS = 500;
export const DEFAULT_PID_POLL_TIMEOUT_MS = 15_000;
const REQUIRED_STABLE_PID_POLLS = 5;

export async function pollForPid(
    tmux: Pick<TmuxManager, 'findAgentPid'>,
    session: string,
    matches: (psCommand: string) => boolean,
    intervalMs: number,
    timeoutMs: number,
): Promise<number | null> {
    const deadline = Date.now() + timeoutMs;
    let candidatePid: number | null = null;
    let stablePolls = 0;

    while (Date.now() < deadline) {
        const pid = await tmux.findAgentPid(session, matches);
        if (pid !== null) {
            if (pid === candidatePid) {
                stablePolls += 1;
            } else {
                candidatePid = pid;
                stablePolls = 1;
            }

            if (stablePolls >= REQUIRED_STABLE_PID_POLLS) return pid;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return null;
}
