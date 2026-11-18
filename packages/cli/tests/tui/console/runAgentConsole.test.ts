import { EventEmitter } from "node:events";
import process from "node:process";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Instance } from "ink";
import type { ReactElement } from "react";
import {
  CONSOLE_EXIT_WATCHDOG_MS,
  createConsoleExitWatchdog,
  exitCodeForSignal,
  releaseConsoleStdin,
  runAgentConsoleInk,
  type ConsoleExitWatchdog,
} from "../../../src/tui/console/runAgentConsole.js";

describe("exitCodeForSignal", () => {
  it("maps common shutdown signals to conventional exit codes", () => {
    expect(exitCodeForSignal("SIGINT")).toBe(130);
    expect(exitCodeForSignal("SIGTERM")).toBe(143);
    expect(exitCodeForSignal("SIGHUP")).toBe(129);
  });
});

describe("releaseConsoleStdin", () => {
  it("disables raw mode, pauses, and unrefs a TTY stdin", () => {
    const setRawMode = vi.fn();
    const pause = vi.fn();
    const unref = vi.fn();
    const stdin = {
      isTTY: true,
      setRawMode,
      pause,
      unref,
    } as unknown as NodeJS.ReadStream;

    releaseConsoleStdin(stdin);

    expect(setRawMode).toHaveBeenCalledWith(false);
    expect(pause).toHaveBeenCalled();
    expect(unref).toHaveBeenCalled();
  });

  it("no-ops when stdin is not a TTY", () => {
    const stdin = { isTTY: false } as NodeJS.ReadStream;
    expect(() => releaseConsoleStdin(stdin)).not.toThrow();
  });
});

describe("createConsoleExitWatchdog", () => {
  it("fires once after the configured delay", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createConsoleExitWatchdog(500);
    watchdog.arm(onTimeout);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("can be disarmed before firing", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createConsoleExitWatchdog(500);
    watchdog.arm(onTimeout);
    watchdog.disarm();
    vi.advanceTimersByTime(1000);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("defaults to the console exit watchdog budget", () => {
    expect(CONSOLE_EXIT_WATCHDOG_MS).toBe(2000);
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    createConsoleExitWatchdog().arm(onTimeout);
    vi.advanceTimersByTime(CONSOLE_EXIT_WATCHDOG_MS);
    expect(onTimeout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

class ProcessExitForTest extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

describe("runAgentConsoleInk", () => {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code: number) => {
    throw new ProcessExitForTest(code);
  });

  beforeEach(() => {
    exitSpy.mockClear();
  });

  afterEach(() => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGHUP");
  });

  function createMockInstance(): Instance {
    let resolveExit: (() => void) | undefined;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const waitUntilExit = vi.fn(() => exitPromise);
    const unmount = vi.fn(() => {
      resolveExit?.();
    });
    return {
      rerender: vi.fn(),
      unmount,
      waitUntilExit,
      waitUntilRenderFlush: vi.fn(),
      cleanup: vi.fn(),
      clear: vi.fn(),
    };
  }

  function createHarness(instance: Instance, watchdog?: ConsoleExitWatchdog) {
    const renderInstance = vi.fn(() => instance);
    const emitter = new EventEmitter();
    const createWatchdog = (): ConsoleExitWatchdog =>
      watchdog ?? {
        arm(onTimeout) {
          emitter.once("timeout", onTimeout);
        },
        disarm() {
          emitter.removeAllListeners("timeout");
        },
      };
    return {
      renderInstance,
      emitter,
      run: () => runAgentConsoleInk({} as ReactElement, {}, { renderInstance, createWatchdog }),
    };
  }

  it("renders the app and exits when Ink finishes", async () => {
    let resolveExit: (() => void) | undefined;
    const instance: Instance = {
      rerender: vi.fn(),
      unmount: vi.fn(),
      waitUntilExit: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveExit = resolve;
            queueMicrotask(() => resolve());
          }),
      ),
      waitUntilRenderFlush: vi.fn(),
      cleanup: vi.fn(),
      clear: vi.fn(),
    };
    const { renderInstance, run } = createHarness(instance);
    await expect(run()).rejects.toBeInstanceOf(ProcessExitForTest);
    expect(renderInstance).toHaveBeenCalledOnce();
    expect(instance.unmount).not.toHaveBeenCalled();
    expect(resolveExit).toBeDefined();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  function invokeLatestSignalHandler(signal: NodeJS.Signals): void {
    const handler = process.listeners(signal).at(-1);
    if (typeof handler !== "function") {
      throw new Error(`no handler for ${signal}`);
    }
    (handler as (name: NodeJS.Signals) => void)(signal);
  }

  it("unmounts and exits with 130 when SIGINT is received", async () => {
    const instance = createMockInstance();
    const { run } = createHarness(instance);
    const running = run();
    await Promise.resolve();
    invokeLatestSignalHandler("SIGINT");
    await Promise.resolve();
    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(130);
    void running;
  });

  it("unmounts and exits with 143 when SIGTERM is received", async () => {
    const instance = createMockInstance();
    const { run } = createHarness(instance);
    const running = run();
    await Promise.resolve();
    invokeLatestSignalHandler("SIGTERM");
    await Promise.resolve();
    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(143);
    void running;
  });

  it("force-exits when Ink teardown exceeds the watchdog", async () => {
    vi.useFakeTimers();
    const instance: Instance = {
      rerender: vi.fn(),
      unmount: vi.fn(),
      waitUntilExit: vi.fn(() => new Promise<void>(() => {})),
      waitUntilRenderFlush: vi.fn(),
      cleanup: vi.fn(),
      clear: vi.fn(),
    };
    const renderInstance = vi.fn(() => instance);
    const running = runAgentConsoleInk(
      {} as ReactElement,
      {},
      {
        renderInstance,
        createWatchdog: () => createConsoleExitWatchdog(500),
      },
    );
    await Promise.resolve();
    invokeLatestSignalHandler("SIGINT");
    await vi.advanceTimersByTimeAsync(500);
    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(130);
    void running;
    vi.useRealTimers();
  });
});
