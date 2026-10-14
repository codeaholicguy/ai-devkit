import { PassThrough } from "node:stream";
import React, { useState } from "react";
import { render } from "ink";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentInfo, AgentManager } from "@ai-devkit/agent-manager";
import type { DaemonEvent } from "@ai-devkit/daemon-client";
import type { ActionResult } from "../../../../tui/console/actions/runAction.js";
import type { RightPaneMode, TransientMessage } from "../../../../tui/console/types.js";

let daemonClient: {
  subscribe: (h: (e: DaemonEvent) => void) => Promise<void>;
  close: () => void;
} | null = null;

vi.mock("@ai-devkit/daemon-client", () => ({
  ensureDaemon: () => Promise.resolve(daemonClient),
  DaemonClient: { tryConnect: () => Promise.resolve(null) },
}));

vi.mock("../../../../tui/console/actions/runAction.js", () => ({
  runAction: vi.fn(),
}));

import { runAction } from "../../../../tui/console/actions/runAction.js";
import {
  getRenameActionError,
  useRenameAgentPane,
} from "../../../../tui/console/hooks/useRenameAgentPane.js";
import {
  ConsoleProvider,
  useConsoleAgentContext,
} from "../../../../tui/console/state/ConsoleContext.js";

const runActionMock = vi.mocked(runAction);

function renderInk(element: React.ReactElement) {
  const output = new PassThrough();
  return render(element, {
    stdout: output as unknown as NodeJS.WriteStream,
    interactive: false,
    patchConsole: false,
  });
}

describe("getRenameActionError", () => {
  it("returns explicit subprocess errors", () => {
    expect(getRenameActionError({ exitCode: 1, error: "name already exists" })).toBe(
      "name already exists",
    );
  });

  it("returns a fallback error for non-zero exits without stderr", () => {
    expect(getRenameActionError({ exitCode: 1 })).toBe("rename exited 1");
  });

  it("returns null for a successful rename result", () => {
    expect(getRenameActionError({ exitCode: 0 })).toBeNull();
  });
});

interface RenameHarness {
  submit: (currentName: string, newName: string) => void;
  rightPaneMode: () => RightPaneMode;
  transient: () => TransientMessage | null;
  error: () => string | null;
  calls: string[];
  refresh: () => Promise<void>;
  selectAgent: (name: string) => void;
}

function renderRenameHarness(): RenameHarness {
  const calls: string[] = [];
  const refresh = vi.fn(async () => {
    calls.push("refresh");
  });
  const selectAgent = vi.fn((name: string) => {
    calls.push(`select:${name}`);
  });
  let submitFn: (currentName: string, newName: string) => void = () => {};
  let mode: RightPaneMode = { type: "preview" };
  let msg: TransientMessage | null = null;
  let err: string | null = null;

  const Harness: React.FC = () => {
    const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>({ type: "preview" });
    const [transient, setTransient] = useState<TransientMessage | null>(null);
    const [, setFocus] = useState("list");
    const hook = useRenameAgentPane({
      refresh,
      selectAgent,
      setFocus,
      setRightPaneMode,
      setTransient,
    });
    submitFn = (currentName, newName) => hook.handleRenameSubmit(currentName, { newName });
    mode = rightPaneMode;
    msg = transient;
    err = hook.renamePaneError;
    return null;
  };
  renderInk(React.createElement(Harness));
  return {
    submit: (currentName, newName) => submitFn(currentName, newName),
    rightPaneMode: () => mode,
    transient: () => msg,
    error: () => err,
    calls,
    refresh,
    selectAgent,
  };
}

describe("useRenameAgentPane", () => {
  beforeEach(() => {
    runActionMock.mockReset();
    daemonClient = null;
  });

  it("refreshes the list then selects the new name only after a successful rename", async () => {
    runActionMock.mockResolvedValue({ exitCode: 0 } satisfies ActionResult);
    const h = renderRenameHarness();

    h.submit("old-name", "new-name");

    await vi.waitFor(() => {
      expect(h.calls).toEqual(["refresh", "select:new-name"]);
    });
    expect(h.rightPaneMode()).toEqual({ type: "preview" });
    expect(h.transient()).toEqual({
      kind: "info",
      text: "Renamed old-name to new-name",
    });
    expect(h.error()).toBeNull();
  });

  it("does not refresh or change selection when the rename fails", async () => {
    runActionMock.mockResolvedValue({ exitCode: 1, error: "name already exists" });
    const h = renderRenameHarness();

    h.submit("old-name", "new-name");

    await vi.waitFor(() => {
      expect(h.error()).toBe("name already exists");
    });
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.selectAgent).not.toHaveBeenCalled();
    expect(h.transient()).toBeNull();
  });
});

function agentFixture(name: string): AgentInfo {
  return {
    name,
    status: "running",
    type: "codex",
    lastActive: new Date("2026-01-01T00:00:00Z"),
  } as AgentInfo;
}

interface ConsoleRenameHarness {
  submit: (currentName: string, newName: string) => void;
  agents: () => AgentInfo[];
  selected: () => string | null;
}

function renderConsoleRenameHarness(manager: AgentManager): ConsoleRenameHarness {
  let submitFn: (currentName: string, newName: string) => void = () => {};
  let currentAgents: AgentInfo[] = [];
  let currentSelected: string | null = "old-name";

  const Consumer: React.FC = () => {
    const { agents, refresh } = useConsoleAgentContext();
    const [selected, setSelected] = useState<string | null>("old-name");
    const hook = useRenameAgentPane({
      refresh,
      selectAgent: setSelected,
      setFocus: () => {},
      setRightPaneMode: () => {},
      setTransient: () => {},
    });
    submitFn = (currentName, newName) => hook.handleRenameSubmit(currentName, { newName });
    currentAgents = agents;
    currentSelected = selected;
    return null;
  };

  renderInk(
    React.createElement(
      ConsoleProvider,
      { manager, inputFocused: false },
      React.createElement(Consumer),
    ),
  );
  return {
    submit: (currentName, newName) => submitFn(currentName, newName),
    agents: () => currentAgents,
    selected: () => currentSelected,
  };
}

describe("console rename refresh integration", () => {
  beforeEach(() => {
    runActionMock.mockReset();
    daemonClient = null;
  });

  it("refreshes the visible list and reselects the new name without a daemon", async () => {
    const manager = {
      listAgents: vi
        .fn()
        .mockResolvedValueOnce([agentFixture("old-name")])
        .mockResolvedValue([agentFixture("new-name")]),
    } as unknown as AgentManager;
    const h = renderConsoleRenameHarness(manager);

    await vi.waitFor(() => expect(h.agents().map((a) => a.name)).toEqual(["old-name"]));
    runActionMock.mockResolvedValue({ exitCode: 0 });

    h.submit("old-name", "new-name");

    await vi.waitFor(() => {
      expect(h.agents().map((a) => a.name)).toEqual(["new-name"]);
      expect(h.selected()).toBe("new-name");
    });
    expect(manager.listAgents).toHaveBeenCalledTimes(2);
  });

  it("still refreshes immediately when the daemon subscription relaxes polling", async () => {
    daemonClient = {
      subscribe: () => Promise.resolve(),
      close: vi.fn(),
    };
    const manager = {
      listAgents: vi
        .fn()
        .mockResolvedValueOnce([agentFixture("old-name")])
        .mockResolvedValue([agentFixture("new-name")]),
    } as unknown as AgentManager;
    const h = renderConsoleRenameHarness(manager);

    await vi.waitFor(() => expect(h.agents().map((a) => a.name)).toEqual(["old-name"]));
    // Give the daemon attach a tick to subscribe and relax the poll to 60s.
    await new Promise((resolve) => setTimeout(resolve, 10));
    runActionMock.mockResolvedValue({ exitCode: 0 });

    h.submit("old-name", "new-name");

    await vi.waitFor(() => {
      expect(h.agents().map((a) => a.name)).toEqual(["new-name"]);
      expect(h.selected()).toBe("new-name");
    });
  });
});
