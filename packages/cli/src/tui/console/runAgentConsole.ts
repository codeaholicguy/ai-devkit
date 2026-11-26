import process from "node:process";
import type { Instance, RenderOptions } from "ink";
import type { ReactElement } from "react";

export const CONSOLE_EXIT_WATCHDOG_MS = 2_000;

export const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
} as const satisfies Partial<Record<NodeJS.Signals, number>>;

type ShutdownSignal = keyof typeof SIGNAL_EXIT_CODES;
const SHUTDOWN_SIGNALS = Object.keys(SIGNAL_EXIT_CODES) as ShutdownSignal[];

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

export interface RunAgentConsoleInkOptions {
  renderInstance: (app: ReactElement, options: RenderOptions) => Instance;
  watchdogMs?: number;
}

export async function runAgentConsoleInk(
  app: ReactElement,
  renderOptions: RenderOptions,
  { renderInstance, watchdogMs = CONSOLE_EXIT_WATCHDOG_MS }: RunAgentConsoleInkOptions,
): Promise<void> {
  const instance = renderInstance(app, renderOptions);
  let signalExitCode: number | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  const cleanup = (): void => {
    for (const signal of SHUTDOWN_SIGNALS) {
      process.off(signal, onSignal);
    }
    if (watchdog !== undefined) {
      clearTimeout(watchdog);
      watchdog = undefined;
    }
  };

  const forceProcessExit = (code: number): void => {
    cleanup();
    releaseConsoleStdin();
    process.exit(code);
  };

  const exitFromCallback = (code: number): void => {
    try {
      forceProcessExit(code);
    } catch {
      // Tests may stub process.exit to throw; production never returns.
    }
  };

  const onSignal = (signal: ShutdownSignal): void => {
    if (signalExitCode !== undefined) return;
    const code = SIGNAL_EXIT_CODES[signal];
    signalExitCode = code;

    watchdog = setTimeout(() => exitFromCallback(code), watchdogMs);
    watchdog.unref?.();

    try {
      instance.unmount();
    } catch {
      exitFromCallback(code);
    }
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, onSignal);
  }

  let hasExitError = false;
  let exitError: unknown;
  try {
    await instance.waitUntilExit();
  } catch (error) {
    hasExitError = true;
    exitError = error;
  } finally {
    cleanup();
  }

  if (signalExitCode !== undefined) {
    forceProcessExit(signalExitCode);
  }
  if (hasExitError) {
    releaseConsoleStdin();
    throw exitError;
  }
  forceProcessExit(0);
}
