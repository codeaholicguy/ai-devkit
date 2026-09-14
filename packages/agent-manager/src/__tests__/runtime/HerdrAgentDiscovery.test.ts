import {
  extractHerdrAgentPanes,
  fetchHerdrAgentPanes,
  findMatchingHerdrPane,
} from "../../runtime/herdr/HerdrAgentDiscovery.js";
import type { HerdrCommandRunner } from "../../runtime/herdr/HerdrCliClient.js";

function jsonResponse(value: unknown): { stdout: string; stderr: string } {
  return { stdout: JSON.stringify(value), stderr: "" };
}

describe("HerdrAgentDiscovery", () => {
  it("extracts agent panes from pane list responses", () => {
    const panes = extractHerdrAgentPanes({
      result: {
        panes: [
          {
            agent: "codex",
            agent_session: { value: "session-1" },
            cwd: "/repo",
            pane_id: "w32:p1",
            workspace_id: "w32",
            tab_id: "w32:t1",
          },
        ],
      },
    });

    expect(panes).toEqual([
      {
        agent: "codex",
        agentSessionId: "session-1",
        cwd: "/repo",
        paneId: "w32:p1",
        workspaceId: "w32",
        tabId: "w32:t1",
      },
    ]);
  });

  it("matches by foreground PID before falling back to ambiguous cwd and type", () => {
    const pane = findMatchingHerdrPane(
      {
        type: "codex",
        projectPath: "/repo",
        sessionId: "pid-64904",
        pid: 64904,
      },
      [
        { agent: "codex", cwd: "/repo", paneId: "w31:p1", foregroundPids: [44290] },
        { agent: "codex", cwd: "/repo", paneId: "w32:p1", foregroundPids: [64904] },
      ],
    );

    expect(pane?.paneId).toBe("w32:p1");
  });

  it("prefers a foreground PID match over a shell PID match", () => {
    const pane = findMatchingHerdrPane(
      {
        type: "codex",
        projectPath: "/repo",
        sessionId: "pid-64904",
        pid: 64904,
      },
      [
        { agent: "codex", cwd: "/repo", paneId: "w31:p1", shellPid: 64904 },
        { agent: "codex", cwd: "/repo", paneId: "w32:p1", foregroundPids: [64904] },
      ],
    );

    expect(pane?.paneId).toBe("w32:p1");
  });

  it("enriches pane list output with foreground process IDs", async () => {
    const runner = vi
      .fn<HerdrCommandRunner>()
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            panes: [
              { agent: "codex", cwd: "/repo", pane_id: "w31:p1" },
              { agent: "codex", cwd: "/repo", pane_id: "w32:p1" },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            process_info: {
              pane_id: "w31:p1",
              shell_pid: 111,
              foreground_processes: [{ pid: 44290 }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            process_info: {
              pane_id: "w32:p1",
              shell_pid: 222,
              foreground_processes: [{ pid: 64904 }],
            },
          },
        }),
      );

    const panes = await fetchHerdrAgentPanes(runner);

    expect(runner).toHaveBeenNthCalledWith(1, "herdr", ["pane", "list"]);
    expect(runner).toHaveBeenNthCalledWith(2, "herdr", [
      "pane",
      "process-info",
      "--pane",
      "w31:p1",
    ]);
    expect(runner).toHaveBeenNthCalledWith(3, "herdr", [
      "pane",
      "process-info",
      "--pane",
      "w32:p1",
    ]);
    expect(panes).toMatchObject([
      { paneId: "w31:p1", foregroundPids: [44290], shellPid: 111 },
      { paneId: "w32:p1", foregroundPids: [64904], shellPid: 222 },
    ]);
  });
});
