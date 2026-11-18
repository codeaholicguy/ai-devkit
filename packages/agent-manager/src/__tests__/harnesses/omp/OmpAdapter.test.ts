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
  let previousXdgDataHome: string | undefined;
  let previousConfigDir: string | undefined;
  let previousAgentDir: string | undefined;
  beforeEach(() => {
    previousHome = process.env.HOME;
    previousXdgDataHome = process.env.XDG_DATA_HOME;
    previousConfigDir = process.env.PI_CONFIG_DIR;
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    delete process.env.XDG_DATA_HOME;
    delete process.env.PI_CONFIG_DIR;
    delete process.env.PI_CODING_AGENT_DIR;
    home = fs.mkdtempSync(path.join(os.tmpdir(), "omp-adapter-"));
    cwd = path.join(home, "Documents", "repo");
    sessionsDir = path.join(home, ".omp", "agent", "sessions", "-Documents-repo");
    fs.mkdirSync(sessionsDir, { recursive: true });
    process.env.HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousXdgDataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = previousXdgDataHome;
    if (previousConfigDir === undefined) delete process.env.PI_CONFIG_DIR;
    else process.env.PI_CONFIG_DIR = previousConfigDir;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
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
    expect(
      adapter.canHandle(
        makeProcess(
          "bun /home/me/.nvm/versions/node/v24.15.0/bin/omp --no-session --mode rpc --no-ui",
        ),
      ),
    ).toBe(true);
    expect(adapter.canHandle(makeProcess("bun /repo/tools/cli.js"))).toBe(false);
    expect(adapter.canHandle(makeProcess("node /repo/tool.js omp"))).toBe(false);
    expect(adapter.canHandle(makeProcess("node /repo/omp-helper.js"))).toBe(false);
  });

  it("lists sessions from default, profile, and XDG storage roots", async () => {
    const xdgDataHome = path.join(home, "xdg-data");
    process.env.XDG_DATA_HOME = xdgDataHome;
    writeSession(sessionsDir, "default-session", cwd);
    writeSession(
      path.join(home, ".omp", "profiles", "work", "agent", "sessions", "-Documents-repo"),
      "profile-session",
      cwd,
    );
    writeSession(path.join(xdgDataHome, "omp", "sessions", "-Documents-repo"), "xdg-session", cwd);
    writeSession(
      path.join(xdgDataHome, "omp", "profiles", "work", "sessions", "-Documents-repo"),
      "xdg-profile-session",
      cwd,
    );

    const sessions = await new OmpAdapter(
      new AgentRegistry(path.join(home, "registry.db")),
    ).listSessions({ cwd });

    expect(new Set(sessions.map((session) => session.sessionId))).toEqual(
      new Set(["default-session", "profile-session", "xdg-session", "xdg-profile-session"]),
    );
  });
  it("matches running sessions from profile storage roots", async () => {
    const sessionPath = writeSession(
      path.join(home, ".omp", "profiles", "work", "agent", "sessions", "-Documents-repo"),
      "running-profile-session",
      cwd,
    );
    const agents = await new OmpAdapter(
      new AgentRegistry(path.join(home, "registry.db")),
    ).detectAgents({
      processes: [makeProcess("omp --profile work", 44)],
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "omp",
      pid: 44,
      sessionId: "running-profile-session",
      sessionFilePath: sessionPath,
    });
  });

  it("honors PI_CONFIG_DIR for the default OMP storage root", async () => {
    process.env.PI_CONFIG_DIR = ".omp-custom";
    writeSession(
      path.join(home, ".omp-custom", "agent", "sessions", "-Documents-repo"),
      "custom-config-session",
      cwd,
    );

    const sessions = await new OmpAdapter(
      new AgentRegistry(path.join(home, "registry.db")),
    ).listSessions({ cwd });

    expect(sessions.map((session) => session.sessionId)).toEqual(["custom-config-session"]);
  });

  it("honors PI_CODING_AGENT_DIR for the default OMP storage root", async () => {
    const agentDir = path.join(home, "omp-agent");
    process.env.PI_CODING_AGENT_DIR = agentDir;
    writeSession(path.join(agentDir, "sessions", "-Documents-repo"), "override-session", cwd);

    const sessions = await new OmpAdapter(
      new AgentRegistry(path.join(home, "registry.db")),
    ).listSessions({ cwd });

    expect(sessions.map((session) => session.sessionId)).toEqual(["override-session"]);
  });

  it("uses OMP's absolute bucket encoding outside the home directory", async () => {
    const outsideCwd = "/srv/app";
    writeSession(
      path.join(home, ".omp", "agent", "sessions", "--srv-app--"),
      "absolute-session",
      outsideCwd,
    );

    const sessions = await new OmpAdapter(
      new AgentRegistry(path.join(home, "registry.db")),
    ).listSessions({ cwd: outsideCwd });

    expect(sessions.map((session) => session.sessionId)).toEqual(["absolute-session"]);
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

  function writeSession(root: string, id: string, sessionCwd: string): string {
    fs.mkdirSync(root, { recursive: true });
    const sessionPath = path.join(root, `2026-10-27T08-50-14-737Z_${id}.jsonl`);
    fs.writeFileSync(
      sessionPath,
      [
        JSON.stringify({ type: "session", version: 3, id, cwd: sessionCwd }),
        JSON.stringify({
          type: "message",
          message: { role: "user", content: [{ type: "text", text: id }] },
        }),
      ].join("\n") + "\n",
    );
    return sessionPath;
  }

  function makeProcess(command: string, pid = 1): ProcessInfo {
    return { pid, command, cwd, tty: "pts/0", startTime: new Date() };
  }
});
