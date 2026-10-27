import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { OmpAdapter } from "../../../harnesses/omp/OmpAdapter.js";
import { AgentRegistry } from "../../../utils/AgentRegistry.js";

describe("OmpAdapter", () => {
  let home: string;
  let cwd: string;
  let sessionsDir: string;
  let previousHome: string | undefined;
  beforeEach(() => {
    previousHome = process.env.HOME;
    home = fs.mkdtempSync(path.join(os.tmpdir(), "omp-adapter-"));
    cwd = path.join(home, "Documents", "repo");
    sessionsDir = path.join(home, ".omp", "agent", "sessions", "-Documents-repo");
    fs.mkdirSync(sessionsDir, { recursive: true });
    process.env.HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("exposes the omp type", () => {
    expect(new OmpAdapter(new AgentRegistry(path.join(home, "registry.db"))).type).toBe("omp");
  });

  it("matches direct and Bun-launched OMP commands but rejects unrelated runtimes", () => {
    const adapter = new OmpAdapter(new AgentRegistry(path.join(home, "registry.db")));
    expect(adapter.canHandle(makeProcess("omp --profile work"))).toBe(true);
    expect(
      adapter.canHandle(
        makeProcess(
          "/home/me/.bun/bin/bun /home/me/.npm/@oh-my-pi/pi-coding-agent/dist/cli.js --profile work",
        ),
      ),
    ).toBe(true);
    expect(adapter.canHandle(makeProcess("bun /repo/tools/cli.js"))).toBe(false);
    expect(adapter.canHandle(makeProcess("node /repo/tool.js omp"))).toBe(false);
    expect(adapter.canHandle(makeProcess("node /repo/omp-helper.js"))).toBe(false);
  });

  it("lists and reads OMP sessions from the home-relative project bucket", async () => {
    const sessionPath = path.join(
      sessionsDir,
      "2026-10-27T08-50-14-737Z_01a17c8d-9051-7198-8fbd-3a2e507ce9a4.jsonl",
    );
    fs.writeFileSync(
      sessionPath,
      [
        JSON.stringify({ type: "session", version: 3, id: "omp-session", cwd }),
        JSON.stringify({
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "profile task" }] },
        }),
        JSON.stringify({
          type: "message",
          message: { role: "assistant", content: [{ type: "text", text: "done" }] },
        }),
      ].join("\n") + "\n",
    );

    const adapter = new OmpAdapter(new AgentRegistry(path.join(home, "registry.db")));
    const sessions = await adapter.listSessions({ cwd });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      type: "omp",
      cwd,
      sessionId: "omp-session",
      firstUserMessage: "profile task",
    });
    expect(adapter.getConversation(sessionPath)).toEqual([
      expect.objectContaining({ role: "user", content: "profile task" }),
      expect.objectContaining({ role: "assistant", content: "done" }),
    ]);
  });

  it("maps a running OMP process through its registered session", async () => {
    const sessionPath = path.join(
      sessionsDir,
      "2026-10-27T08-50-14-737Z_01a17c8d-9051-7198-8fbd-3a2e507ce9a4.jsonl",
    );
    fs.writeFileSync(
      sessionPath,
      `${JSON.stringify({ type: "session", version: 3, id: "omp-session", cwd })}\n${JSON.stringify({ type: "message", message: { role: "user", content: "hello" } })}\n`,
    );
    const registry = new AgentRegistry(path.join(home, "registry.db"));
    registry.register({
      name: "omp-work",
      type: "omp",
      pid: 42,
      runtime: "tmux",
      runtimeRef: { session: "omp-work" },
      cwd,
      startedAt: new Date().toISOString(),
      sessionId: "omp-session",
      sessionFilePath: sessionPath,
      pinned: false,
    });

    const adapter = new OmpAdapter(registry);
    const agents = await adapter.detectAgents({
      processes: [makeProcess("omp --profile work", 42)],
    });
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "omp",
      pid: 42,
      status: AgentStatus.RUNNING,
      sessionId: "omp-session",
    });
  });
  it("does not trust a registered session path outside the OMP root", async () => {
    const outsidePath = path.join(home, "outside.jsonl");
    fs.writeFileSync(outsidePath, "{}\n");
    const registry = new AgentRegistry(path.join(home, "registry.db"));
    registry.register({
      name: "omp-work",
      type: "omp",
      pid: 43,
      runtime: "tmux",
      runtimeRef: { session: "omp-work" },
      cwd,
      startedAt: new Date().toISOString(),
      sessionId: "outside-session",
      sessionFilePath: outsidePath,
      pinned: false,
    });

    const agents = await new OmpAdapter(registry).detectAgents({
      processes: [makeProcess("omp --profile work", 43)],
    });
    expect(agents[0]).toMatchObject({
      type: "omp",
      pid: 43,
      summary: "OMP process running",
    });
    expect(agents[0].sessionFilePath).toBeUndefined();
  });

  function makeProcess(command: string, pid = 1): ProcessInfo {
    return { pid, command, cwd, tty: "pts/0", startTime: new Date() };
  }
});
