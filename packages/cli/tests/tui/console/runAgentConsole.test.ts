import process from "node:process";
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import type { Instance } from "ink";
import type { ReactElement } from "react";
import {
  CONSOLE_EXIT_WATCHDOG_MS,
  SIGNAL_EXIT_CODES,
  releaseConsoleStdin,
  runAgentConsoleInk,
} from "../../../src/tui/console/runAgentConsole.js";

describe("SIGNAL_EXIT_CODES", () => {
  it("maps shutdown signals to conventional exit codes", () => {
    expect(SIGNAL_EXIT_CODES).toEqual({
      SIGINT: 130,
      SIGTERM: 143,
      SIGHUP: 129,
    });
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

  it("still pauses and unrefs when setRawMode throws (e.g. after SIGHUP)", () => {
    const setRawMode = vi.fn(() => {
      throw new Error("EBADF");
    });
    const pause = vi.fn();
    const unref = vi.fn();
    const stdin = {
      isTTY: true,
      setRawMode,
      pause,
      unref,
    } as unknown as NodeJS.ReadStream;

    expect(() => releaseConsoleStdin(stdin)).not.toThrow();
    expect(pause).toHaveBeenCalled();
    expect(unref).toHaveBeenCalled();
  });

  it("no-ops when stdin is not a TTY", () => {
    const stdin = { isTTY: false } as NodeJS.ReadStream;
    expect(() => releaseConsoleStdin(stdin)).not.toThrow();
  });
});

class ProcessExitForTest extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

describe("runAgentConsoleInk", () => {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new ProcessExitForTest(typeof code === "number" ? code : 0);
  });

  beforeEach(() => {
    exitSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    exitSpy.mockRestore();
  });

  function createMockInstance(overrides?: {
    onUnmount?: (resolveExit: () => void, rejectExit: (err: unknown) => void) => void;
  }): {
    instance: Instance;
    resolveExit: () => void;
    rejectExit: (err: unknown) => void;
  } {
    let resolveExit!: () => void;
    let rejectExit!: (err: unknown) => void;
    const exitPromise = new Promise<void>((resolve, reject) => {
      resolveExit = resolve;
      rejectExit = reject;
    });
    const waitUntilExit = vi.fn(() => exitPromise);
    const unmount = vi.fn(() => {
      if (overrides?.onUnmount) {
        overrides.onUnmount(resolveExit, rejectExit);
      } else {
        resolveExit();
      }
    });
    const instance: Instance = {
      rerender: vi.fn(),
      unmount,
      waitUntilExit,
      waitUntilRenderFlush: vi.fn(),
      cleanup: vi.fn(),
      clear: vi.fn(),
    };
    return { instance, resolveExit, rejectExit };
  }

  function invokeLatestSignalHandler(signal: NodeJS.Signals): void {
    const handler = process.listeners(signal).at(-1);
    if (typeof handler !== "function") {
      throw new Error(`no handler for ${signal}`);
    }
    (handler as (name: NodeJS.Signals) => void)(signal);
  }

  function listenerCounts() {
    return {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
      SIGHUP: process.listenerCount("SIGHUP"),
    };
  }

  it("renders the app, cleans up signal listeners, and exits 0 when Ink finishes", async () => {
    const before = listenerCounts();
    const { instance, resolveExit } = createMockInstance();
    const renderInstance = vi.fn(() => instance);

    const running = runAgentConsoleInk({} as ReactElement, {}, { renderInstance });
    resolveExit();

    await expect(running).rejects.toMatchObject({ code: 0 });
    expect(renderInstance).toHaveBeenCalledOnce();
    expect(instance.unmount).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(listenerCounts()).toEqual(before);
  });

  it("rethrows Ink exit errors instead of swallowing them", async () => {
    const before = listenerCounts();
    const { instance, rejectExit } = createMockInstance();
    const renderInstance = vi.fn(() => instance);
    const boom = new Error("render failure");

    const running = runAgentConsoleInk({} as ReactElement, {}, { renderInstance });
    rejectExit(boom);

    await expect(running).rejects.toBe(boom);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(listenerCounts()).toEqual(before);
  });

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGHUP", 129],
  ] as const)("unmounts on %s and exits with %d", async (signal, expectedCode) => {
    const before = listenerCounts();
    const { instance } = createMockInstance();
    const renderInstance = vi.fn(() => instance);

    const running = runAgentConsoleInk({} as ReactElement, {}, { renderInstance });
    invokeLatestSignalHandler(signal);

    await expect(running).rejects.toMatchObject({ code: expectedCode });
    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(expectedCode);
    expect(listenerCounts()).toEqual(before);
  });

  it("ignores duplicate signals while tearing down", async () => {
    const before = listenerCounts();
    const { instance, resolveExit } = createMockInstance({
      onUnmount: () => {
        // Keep waitUntilExit pending until we explicitly resolve it.
      },
    });
    const renderInstance = vi.fn(() => instance);

    const running = runAgentConsoleInk({} as ReactElement, {}, { renderInstance });
    invokeLatestSignalHandler("SIGTERM");
    invokeLatestSignalHandler("SIGTERM");
    invokeLatestSignalHandler("SIGINT");
    resolveExit();

    await expect(running).rejects.toMatchObject({ code: 143 });
    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(143);
    expect(listenerCounts()).toEqual(before);
  });

  it("force-exits immediately if instance.unmount() throws synchronously", async () => {
    const before = listenerCounts();
    const { instance, resolveExit } = createMockInstance({
      onUnmount: () => {
        throw new Error("unmount crashed");
      },
    });
    const renderInstance = vi.fn(() => instance);

    const running = runAgentConsoleInk({} as ReactElement, {}, { renderInstance });
    invokeLatestSignalHandler("SIGTERM");

    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(143);
    expect(listenerCounts()).toEqual(before);

    // Clean up the pending promise from the test harness.
    resolveExit();
    await expect(running).rejects.toMatchObject({ code: 143 });
  });

  it("force-exits when Ink teardown exceeds the watchdog budget", async () => {
    vi.useFakeTimers();
    const before = listenerCounts();
    const { instance, resolveExit } = createMockInstance({
      onUnmount: () => {
        // Simulate hung teardown where waitUntilExit never settles on its own.
      },
    });
    const renderInstance = vi.fn(() => instance);

    const running = runAgentConsoleInk(
      {} as ReactElement,
      {},
      { renderInstance, watchdogMs: CONSOLE_EXIT_WATCHDOG_MS },
    );
    invokeLatestSignalHandler("SIGINT");

    await vi.advanceTimersByTimeAsync(CONSOLE_EXIT_WATCHDOG_MS - 1);
    expect(exitSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(130);
    expect(listenerCounts()).toEqual(before);

    // Settle the promise so no pending promise leaks across tests.
    resolveExit();
    await expect(running).rejects.toMatchObject({ code: 130 });
  });
});
