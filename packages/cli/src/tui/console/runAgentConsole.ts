import process from "node:process";
import type { Instance, RenderOptions } from "ink";
import type { ReactElement } from "react";

/** Wall-clock limit for Ink teardown before we force-exit anyway (#295). */
export const CONSOLE_EXIT_WATCHDOG_MS = 2_000;

/** Map a termination signal to a conventional CLI exit code. */
export function exitCodeForSignal(signal: NodeJS.Signals): number {
  switch (signal) {
    case "SIGINT":
      return 130;
    case "SIGTERM":
      return 143;
    case "SIGHUP":
      return 129;
    default:
      return 1;
  }
}

/** Best-effort stdin teardown so leaked TTY refs cannot keep the loop alive. */
export function releaseConsoleStdin(stdin: NodeJS.ReadStream = process.stdin): void {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return;
  }
  try {
    stdin.setRawMode(false);
  } catch {
    // Stream may already be closed after SIGHUP.
  }
  stdin.pause();
  stdin.unref();
}

export interface ConsoleExitWatchdog {
  arm(onTimeout: () => void): void;
  disarm(): void;
}

/** Arm a one-shot watchdog around Ink unmount; used by tests via injection. */
export function createConsoleExitWatchdog(
  ms: number = CONSOLE_EXIT_WATCHDOG_MS,
): ConsoleExitWatchdog {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return {
    arm(onTimeout) {
      disarmWatchdog();
      handle = setTimeout(onTimeout, ms);
      handle.unref?.();
    },
    disarm() {
      disarmWatchdog();
    },
  };

  function disarmWatchdog() {
    if (handle !== undefined) {
      clearTimeout(handle);
      handle = undefined;
    }
  }
}

export interface RunAgentConsoleInkOptions {
  renderInstance: (app: ReactElement, options: RenderOptions) => Instance;
  createWatchdog?: () => ConsoleExitWatchdog;
}

/**
 * Owns Ink instance lifecycle for `agent console`: signal-driven exit,
 * bounded wait on `waitUntilExit`, stdin release, and a final `process.exit`
 * so the CLI never depends on the event loop draining on its own (#295).
 */
export async function runAgentConsoleInk(
  app: ReactElement,
  renderOptions: RenderOptions,
  { renderInstance, createWatchdog = createConsoleExitWatchdog }: RunAgentConsoleInkOptions,
): Promise<void> {
  const instance = renderInstance(app, renderOptions);
  const watchdog = createWatchdog();
  let tearingDown = false;
  let exitCode = 0;

  const forceProcessExit = (code: number): void => {
    releaseConsoleStdin();
    // eslint-disable-next-line n/no-process-exit -- deliberate console shutdown (#295)
    process.exit(code);
  };

  const teardown = async (code: number): Promise<void> => {
    if (tearingDown) return;
    tearingDown = true;
    exitCode = code;
    instance.unmount();
    watchdog.arm(() => {
      try {
        forceProcessExit(code);
      } catch {
        // Tests may stub process.exit to throw; production never returns.
      }
    });
    try {
      await instance.waitUntilExit();
    } catch {
      // Ink reports exit(errors) via rejection; still shut down.
    } finally {
      watchdog.disarm();
    }
    forceProcessExit(code);
  };

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const onSignal = (signal: NodeJS.Signals) => {
    void teardown(exitCodeForSignal(signal)).catch(() => {
      // process.exit ends the CLI; tests may stub it to throw.
    });
  };
  for (const signal of signals) {
    process.once(signal, onSignal);
  }

  try {
    await instance.waitUntilExit();
  } catch {
    exitCode = 1;
  } finally {
    for (const signal of signals) {
      process.removeListener(signal, onSignal);
    }
    watchdog.disarm();
    if (!tearingDown) {
      tearingDown = true;
      forceProcessExit(exitCode);
    }
  }
}
