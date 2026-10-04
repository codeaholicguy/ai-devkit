import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentStatus, type ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { DevinAdapter } from "../../../harnesses/devin/DevinAdapter.js";
import { writeDatabase, writeLocks } from "./fixtures.js";

describe("DevinAdapter", () => {
  let adapter: DevinAdapter;
  let tmpDir: string;
  let dbPath: string;
  let locksDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devin-adapter-test-"));
    dbPath = path.join(tmpDir, "sessions.db");
    locksDir = path.join(tmpDir, "session_locks");
    adapter = new DevinAdapter(dbPath, locksDir);
  });

  afterEach(() => {
    adapter.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accepts agent invocations and rejects utility subcommands", () => {
    const cases: [string, boolean][] = [
      ["devin", true],
      ["/usr/local/bin/devin", true],
      ["devin -r brawny-shirt", true],
      ["devin --resume brawny-shirt --model x", true],
      ["devin -p fix the bug", true],
      ["devin -p update the schema", true],
      ["devin --print list files", true],
      ["devin -r", true],
      ["devin --resume", true],
      ["devin --cloud", true],
      ["devin acp", true],
      ["/Users/x/.local/bin/devin acp --cloud", true],
      ["devin -- list the files", true],
      ["devin list", false],
      ["devin ls", false],
      ["devin doctor", false],
      ["devin auth status", false],
      ["devin ssh sess-1", false],
      ["devin forward 8080", false],
      ["devin models", false],
      ["devin skills list", false],
      ["devin rules", false],
      ["devin mcp add x", false],
      ["devin plugins list", false],
      ["devin cloud ls", false],
      ["devin desktop /repo", false],
      ["devin update", false],
      ["devin version", false],
      ["devin migrate", false],
      ["devin sandbox run", false],
      ["devin setup", false],
      ["devin uninstall", false],
      ["devin rm sess-1", false],
      ["devin help", false],
      ["devin --model opus list", false],
      ["devin --model=opus list", false],
      ["devin --config /tmp/c.json update", false],
      ["devin --prompt-file /tmp/p.txt rm", false],
      ["node devin.js", false],
      ["devinition", false],
    ];
    for (const [command, expected] of cases) {
      expect(adapter.canHandle({ pid: 1, command, cwd: "/repo", tty: "ttys001" })).toBe(
        expected,
        command,
      );
    }
  });

  it("returns process-only agents when no database or lock exists", async () => {
    const agents = await adapter.detectAgents({
      processes: [{ pid: 100, command: "devin", cwd: "/repo", tty: "ttys001" }],
    });

    expect(agents).toEqual([
      expect.objectContaining({
        type: "devin",
        status: AgentStatus.RUNNING,
        pid: 100,
        sessionId: "pid-100",
        summary: "Devin process running",
      }),
    ]);
  });

  it("matches a TUI to its session through the acp backend's lock", async () => {
    const now = Math.floor(Date.now() / 1000);
    writeDatabase(dbPath, {
      sessions: [{ id: "brawny-shirt", directory: "/repo", timeCreated: now - 100 }],
      nodes: [
        {
          sessionId: "brawny-shirt",
          nodeId: 1,
          role: "user",
          content: "fix the tests",
          isUserInput: true,
          createdAt: now - 90,
        },
        {
          sessionId: "brawny-shirt",
          nodeId: 2,
          role: "assistant",
          content: "on it",
          createdAt: now - 60,
        },
      ],
      prompts: [{ sessionId: "brawny-shirt", content: "fix the tests", timestamp: now - 90 }],
    });
    writeLocks(locksDir, { "brawny-shirt": 201 });

    const tui: ProcessInfo = { pid: 200, command: "devin", cwd: "/repo", tty: "ttys001" };
    const acp: ProcessInfo = {
      pid: 201,
      ppid: 200,
      command: "/usr/local/bin/devin acp",
      cwd: "/repo",
      tty: "??",
    };
    const agents = await adapter.detectAgents({ processes: [tui, acp] });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "devin",
      status: AgentStatus.WAITING,
      pid: 200,
      sessionId: "brawny-shirt",
      summary: "fix the tests",
      sessionFilePath: `${dbPath}::brawny-shirt`,
    });
  });

  it("lists a standalone devin acp process as an agent via its own lock", async () => {
    const now = Math.floor(Date.now() / 1000);
    writeDatabase(dbPath, {
      sessions: [{ id: "merry-frog", directory: "/repo", timeCreated: now - 50 }],
      nodes: [
        {
          sessionId: "merry-frog",
          nodeId: 1,
          role: "tool",
          content: "running",
          createdAt: now - 10,
        },
      ],
    });
    writeLocks(locksDir, { "merry-frog": 300 });

    const acp: ProcessInfo = {
      pid: 300,
      ppid: 999,
      command: "devin acp",
      cwd: "/repo",
      tty: "??",
    };
    const agents = await adapter.detectAgents({ processes: [acp] });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      type: "devin",
      status: AgentStatus.RUNNING,
      pid: 300,
      sessionId: "merry-frog",
    });
  });

  it("ignores stale locks whose holder is not a live devin process", async () => {
    const now = Math.floor(Date.now() / 1000);
    writeDatabase(dbPath, {
      sessions: [{ id: "dead-session", directory: "/repo", timeCreated: now - 500 }],
    });
    writeLocks(locksDir, { "dead-session": 4242 });

    const agents = await adapter.detectAgents({
      processes: [{ pid: 100, command: "devin", cwd: "/repo", tty: "ttys001" }],
    });

    // No lock match; cwd fallback still finds the session row.
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ type: "devin", sessionId: "dead-session", pid: 100 });
  });

  it("ignores a lock when its pid is reused by a non-devin process", async () => {
    const now = Math.floor(Date.now() / 1000);
    writeDatabase(dbPath, {
      sessions: [{ id: "reused-pid", directory: "/other", timeCreated: now - 500 }],
    });
    writeLocks(locksDir, { "reused-pid": 777 });

    const processes: ProcessInfo[] = [
      { pid: 777, command: "redis-server", cwd: "/", tty: "??" },
      { pid: 100, command: "devin", cwd: "/repo", tty: "ttys001" },
    ];
    const agents = await adapter.detectAgents({ processes });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ sessionId: "pid-100" });
  });

  it("disambiguates two TUIs in the same directory via their locks", async () => {
    const now = Math.floor(Date.now() / 1000);
    writeDatabase(dbPath, {
      sessions: [
        { id: "first", directory: "/repo", timeCreated: now - 200 },
        { id: "second", directory: "/repo", timeCreated: now - 100 },
      ],
      nodes: [
        { sessionId: "first", nodeId: 1, role: "assistant", content: "a", createdAt: now - 50 },
        { sessionId: "second", nodeId: 1, role: "assistant", content: "b", createdAt: now - 40 },
      ],
    });
    writeLocks(locksDir, { first: 401, second: 501 });

    const processes: ProcessInfo[] = [
      { pid: 400, command: "devin", cwd: "/repo", tty: "ttys001" },
      { pid: 401, ppid: 400, command: "devin acp", cwd: "/repo", tty: "??" },
      { pid: 500, command: "devin", cwd: "/repo", tty: "ttys002" },
      { pid: 501, ppid: 500, command: "devin acp", cwd: "/repo", tty: "??" },
    ];
    const agents = await adapter.detectAgents({ processes });

    expect(agents).toHaveLength(2);
    expect(agents.find((a) => a.pid === 400)?.sessionId).toBe("first");
    expect(agents.find((a) => a.pid === 500)?.sessionId).toBe("second");
  });

  it("falls back to working_directory matching without a lock", async () => {
    const now = Math.floor(Date.now() / 1000);
    writeDatabase(dbPath, {
      sessions: [
        { id: "older", directory: "/repo", timeCreated: now - 300, lastActivityAt: now - 300 },
        { id: "newer", directory: "/repo", timeCreated: now - 200, lastActivityAt: now - 60 },
        { id: "hidden-sess", directory: "/repo", timeCreated: now - 10, hidden: 1 },
      ],
      nodes: [
        { sessionId: "newer", nodeId: 1, role: "user", content: "hi", createdAt: now - 60 },
      ],
    });

    const agents = await adapter.detectAgents({
      processes: [{ pid: 100, command: "devin -p work", cwd: "/repo", tty: "ttys001" }],
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ sessionId: "newer", type: "devin" });
  });

  it("survives an unreadable database", async () => {
    fs.writeFileSync(dbPath, "not sqlite at all");
    const agents = await adapter.detectAgents({
      processes: [{ pid: 100, command: "devin", cwd: "/repo", tty: "ttys001" }],
    });
    expect(agents).toEqual([expect.objectContaining({ sessionId: "pid-100" })]);
  });

  it("returns conversation messages for encoded session refs", () => {
    writeDatabase(dbPath, {
      sessions: [{ id: "sess-1", directory: "/repo", timeCreated: 1000 }],
      nodes: [
        { sessionId: "sess-1", nodeId: 1, role: "user", content: "hello", isUserInput: true },
        { sessionId: "sess-1", nodeId: 2, role: "assistant", content: "hi there" },
      ],
    });

    expect(adapter.getConversation(`${dbPath}::sess-1`)).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(adapter.getConversation("/not-a-ref")).toEqual([]);
  });

  it("finds sessions by exact slug", async () => {
    writeDatabase(dbPath, {
      sessions: [
        { id: "wanted", directory: "/repo", timeCreated: 1000 },
        { id: "other", directory: "/other", timeCreated: 999 },
      ],
    });

    await expect(adapter.findSessionsById("wanted")).resolves.toEqual([
      expect.objectContaining({ type: "devin", sessionId: "wanted" }),
    ]);
    await expect(adapter.findSessionsById("missing")).resolves.toEqual([]);
  });
});
