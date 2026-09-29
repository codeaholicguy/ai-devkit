/**
 * Refresh-path I/O tests for the Claude, Codex, Kiro and Antigravity adapters:
 * repeated `listAgents()` calls must only read transcript bytes that changed.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AgentManager } from "../../AgentManager.js";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { ClaudeCodeAdapter } from "../../harnesses/claude/ClaudeCodeAdapter.js";
import { CodexAdapter } from "../../harnesses/codex/CodexAdapter.js";
import { AntigravityCliAdapter } from "../../harnesses/antigravity/AntigravityCliAdapter.js";
import { KiroAdapter } from "../../harnesses/kiro/KiroAdapter.js";
import { AgentRegistry } from "../../utils/AgentRegistry.js";

vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs");
  return {
    ...actual,
    openSync: vi.fn(actual.openSync),
    readSync: vi.fn(actual.readSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

const mockedOpenSync = vi.mocked(fs.openSync);
const mockedReadSync = vi.mocked(fs.readSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);

/** Bytes read from `filePath` via readFileSync or fd reads since the last `resetReads()`. */
function bytesReadFrom(filePath: string): number {
  // fds are reused after close, so attribute each read to the latest open of that fd
  const opens = mockedOpenSync.mock.calls.map((call, index) => ({
    path: String(call[0]),
    fd: mockedOpenSync.mock.results[index]?.value as number,
    order: mockedOpenSync.mock.invocationCallOrder[index],
  }));

  let total = 0;
  mockedReadSync.mock.calls.forEach((call, index) => {
    const result = mockedReadSync.mock.results[index];
    const order = mockedReadSync.mock.invocationCallOrder[index];
    const open = opens.filter((o) => o.fd === call[0] && o.order < order).at(-1);
    if (result?.type === "return" && open?.path === filePath) {
      total += result.value as number;
    }
  });
  mockedReadFileSync.mock.calls.forEach((call, index) => {
    const result = mockedReadFileSync.mock.results[index];
    if (result?.type === "return" && String(call[0]) === filePath) {
      total += Buffer.byteLength(result.value as string | Buffer);
    }
  });
  return total;
}

function resetReads(): void {
  mockedOpenSync.mockClear();
  mockedReadSync.mockClear();
  mockedReadFileSync.mockClear();
}

function jsonl(entries: unknown[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

describe("incremental transcript reads across listAgents() refreshes", () => {
  let originalHome: string | undefined;
  let tmpHome: string;
  let processes: ProcessInfo[];
  let manager: AgentManager;
  let claudeFile: string;
  let codexFile: string;
  let claudeAdapter: ClaudeCodeAdapter;
  let codexAdapter: CodexAdapter;

  const startTime = new Date();
  const claudePid = 71001;
  const codexPid = 72001;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "incremental-refresh-"));
    process.env.HOME = tmpHome;

    // Claude: authoritative PID-file match to a synthetic transcript
    const claudeSessionId = "11111111-2222-3333-4444-555555555555";
    const projectDir = path.join(tmpHome, ".claude", "projects", "-repo-claude");
    const sessionsDir = path.join(tmpHome, ".claude", "sessions");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });
    claudeFile = path.join(projectDir, `${claudeSessionId}.jsonl`);
    fs.writeFileSync(
      claudeFile,
      jsonl([
        {
          type: "user",
          timestamp: startTime.toISOString(),
          cwd: "/repo/claude",
          message: { content: "first task" },
        },
        {
          type: "assistant",
          timestamp: startTime.toISOString(),
          message: { content: "x".repeat(300_000) },
        },
      ]),
    );
    fs.writeFileSync(
      path.join(sessionsDir, `${claudePid}.json`),
      JSON.stringify({
        pid: claudePid,
        sessionId: claudeSessionId,
        cwd: "/repo/claude",
        startedAt: startTime.getTime(),
        kind: "interactive",
        entrypoint: "cli",
      }),
    );

    // Codex: hook session mapping (pid → transcript path)
    const codexSessionId = "019eabed-0000-7000-8000-000000000001";
    const codexDir = path.join(tmpHome, ".codex", "sessions", "2026", "09", "28");
    fs.mkdirSync(codexDir, { recursive: true });
    codexFile = path.join(codexDir, `rollout-2026-09-28T00-00-00-${codexSessionId}.jsonl`);
    fs.writeFileSync(
      codexFile,
      jsonl([
        {
          type: "session_meta",
          payload: { id: codexSessionId, cwd: "/repo/codex", timestamp: startTime.toISOString() },
        },
        {
          type: "event_msg",
          timestamp: startTime.toISOString(),
          payload: { type: "user_message", message: "y".repeat(300_000) },
        },
      ]),
    );
    fs.mkdirSync(path.join(tmpHome, ".codex", "ai-devkit"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".codex", "ai-devkit", "sessions.json"),
      JSON.stringify({ [codexPid]: codexFile }),
    );

    processes = [
      { pid: claudePid, command: "claude", cwd: "/repo/claude", tty: "ttys001", startTime },
      { pid: codexPid, command: "codex", cwd: "/repo/codex", tty: "ttys002", startTime },
    ];
    const registry = new AgentRegistry(path.join(tmpHome, "agents.json"));
    manager = new AgentManager(registry, async () => processes);
    claudeAdapter = new ClaudeCodeAdapter();
    codexAdapter = new CodexAdapter(registry);
    manager.registerAdapter(claudeAdapter);
    manager.registerAdapter(codexAdapter);
    resetReads();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function summaryOf(agents: Awaited<ReturnType<AgentManager["listAgents"]>>, pid: number) {
    const agent = agents.find((candidate) => candidate.pid === pid);
    return { sessionId: agent?.sessionId, status: agent?.status, summary: agent?.summary };
  }

  it("reads 0 transcript bytes on a second refresh when nothing changed", async () => {
    const first = await manager.listAgents();
    expect(bytesReadFrom(claudeFile)).toBe(fs.statSync(claudeFile).size);
    expect(bytesReadFrom(codexFile)).toBe(fs.statSync(codexFile).size);

    resetReads();
    const second = await manager.listAgents();

    expect(bytesReadFrom(claudeFile)).toBe(0);
    expect(bytesReadFrom(codexFile)).toBe(0);
    expect(summaryOf(second, claudePid)).toEqual(summaryOf(first, claudePid));
    expect(summaryOf(second, codexPid)).toEqual(summaryOf(first, codexPid));
  });

  it("reads at most the appended bytes plus 64 KiB after an append", async () => {
    await manager.listAgents();

    const claudeAppend = jsonl([
      { type: "user", timestamp: new Date().toISOString(), message: { content: "follow-up task" } },
    ]);
    const codexAppend = jsonl([
      {
        type: "event_msg",
        timestamp: new Date().toISOString(),
        payload: { type: "agent_message", message: "done" },
      },
    ]);
    fs.appendFileSync(claudeFile, claudeAppend);
    fs.appendFileSync(codexFile, codexAppend);

    resetReads();
    const agents = await manager.listAgents();

    expect(bytesReadFrom(claudeFile)).toBeGreaterThan(0);
    expect(bytesReadFrom(codexFile)).toBeGreaterThan(0);
    expect(bytesReadFrom(claudeFile)).toBeLessThanOrEqual(
      Buffer.byteLength(claudeAppend) + 64 * 1024,
    );
    expect(bytesReadFrom(codexFile)).toBeLessThanOrEqual(
      Buffer.byteLength(codexAppend) + 64 * 1024,
    );
    expect(summaryOf(agents, claudePid).summary).toContain("follow-up task");
    expect(summaryOf(agents, codexPid).summary).toContain("done");
  });

  it("reads at most 5 MiB (+1 byte) of a large transcript on a cold refresh, then only appends", async () => {
    // ~12 MiB of history between the first and the latest turn
    const history = jsonl(
      Array.from({ length: 48 }, () => ({
        type: "assistant",
        timestamp: startTime.toISOString(),
        message: { content: "h".repeat(256 * 1024) },
      })),
    );
    const latest = new Date(startTime.getTime() + 60_000).toISOString();
    fs.appendFileSync(
      claudeFile,
      history +
        jsonl([{ type: "user", timestamp: latest, message: { content: "latest claude task" } }]),
    );
    fs.appendFileSync(
      codexFile,
      history +
        jsonl([
          {
            type: "event_msg",
            timestamp: latest,
            payload: { type: "agent_message", message: "ok" },
          },
        ]),
    );
    resetReads();

    const agents = await manager.listAgents();

    // 1 MiB head + 4 MiB tail, plus the byte before the tail window that tells
    // whether the window starts on a line boundary
    const limit = 5 * 1024 * 1024 + 1;
    expect(fs.statSync(claudeFile).size).toBeGreaterThan(2 * limit);
    expect(bytesReadFrom(claudeFile)).toBeLessThanOrEqual(limit);
    expect(bytesReadFrom(codexFile)).toBeLessThanOrEqual(limit);
    expect(summaryOf(agents, claudePid)).toMatchObject({
      sessionId: "11111111-2222-3333-4444-555555555555",
      summary: expect.stringContaining("latest claude task"),
    });
    expect(summaryOf(agents, codexPid).summary).toContain("ok");

    const append = jsonl([
      { type: "user", timestamp: latest, message: { content: "follow-up after cold start" } },
    ]);
    fs.appendFileSync(claudeFile, append);
    resetReads();

    const refreshed = await manager.listAgents();
    expect(bytesReadFrom(claudeFile)).toBe(Buffer.byteLength(append));
    expect(summaryOf(refreshed, claudePid).summary).toContain("follow-up after cold start");
  });

  it("evicts cache entries for transcripts absent from the latest refresh", async () => {
    await manager.listAgents();
    expect((claudeAdapter as any).parser.sessionCache.size).toBe(1);
    expect((codexAdapter as any).parser.sessionCache.size).toBe(1);

    processes = [];
    await manager.listAgents();

    expect((claudeAdapter as any).parser.sessionCache.size).toBe(0);
    expect((codexAdapter as any).parser.sessionCache.size).toBe(0);
  });
});

describe("incremental Kiro and Antigravity transcript reads across listAgents() refreshes", () => {
  let originalHome: string | undefined;
  let originalAgyHome: string | undefined;
  let tmpHome: string;
  let processes: ProcessInfo[];
  let manager: AgentManager;
  let kiroFile: string;
  let agyFile: string;
  let kiroAdapter: KiroAdapter;
  let agyAdapter: AntigravityCliAdapter;

  const startTime = new Date();
  const kiroPid = 74001;
  const agyPid = 75001;
  const kiroPrompt = (text: string, at = startTime) => ({
    kind: "Prompt",
    data: { content: [{ kind: "text", data: text }], meta: { timestamp: at.getTime() } },
  });
  const kiroReply = (text: string) => ({
    kind: "AssistantMessage",
    data: { content: [{ kind: "text", data: text }] },
  });
  const agyRequest = (text: string, at = startTime) => ({
    type: "USER_INPUT",
    created_at: at.toISOString(),
    content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>`,
  });
  const agyReply = (text: string, at = startTime) => ({
    type: "PLANNER_RESPONSE",
    created_at: at.toISOString(),
    content: text,
  });

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalAgyHome = process.env.ANTIGRAVITY_CLI_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "incremental-refresh-kiro-agy-"));
    process.env.HOME = tmpHome;
    process.env.ANTIGRAVITY_CLI_HOME = path.join(tmpHome, "antigravity");

    // Kiro: a session lock held by the running kiro-cli
    const kiroDir = path.join(tmpHome, ".kiro", "sessions", "cli");
    fs.mkdirSync(kiroDir, { recursive: true });
    kiroFile = path.join(kiroDir, "kiro-session.jsonl");
    fs.writeFileSync(kiroFile, jsonl([kiroPrompt("first task"), kiroReply("x".repeat(300_000))]));
    fs.writeFileSync(
      path.join(kiroDir, "kiro-session.json"),
      JSON.stringify({ session_id: "kiro-session", cwd: "/repo/kiro" }),
    );
    fs.writeFileSync(path.join(kiroDir, "kiro-session.lock"), JSON.stringify({ pid: kiroPid }));

    // Antigravity: the conversation registry maps the process cwd to the transcript
    const agyId = "10485e13-2742-4e9e-b286-ac0606f0cb1e";
    const agyLogs = path.join(tmpHome, "antigravity", "brain", agyId, ".system_generated", "logs");
    fs.mkdirSync(agyLogs, { recursive: true });
    fs.mkdirSync(path.join(tmpHome, "antigravity", "cache"), { recursive: true });
    agyFile = path.join(agyLogs, "transcript.jsonl");
    fs.writeFileSync(agyFile, jsonl([agyRequest("first task"), agyReply("y".repeat(300_000))]));
    fs.writeFileSync(
      path.join(tmpHome, "antigravity", "cache", "last_conversations.json"),
      JSON.stringify({ "/repo/agy": agyId }),
    );

    processes = [
      { pid: kiroPid, command: "kiro-cli", cwd: "/repo/kiro", tty: "ttys003", startTime },
      { pid: agyPid, command: "agy", cwd: "/repo/agy", tty: "ttys004", startTime },
    ];
    manager = new AgentManager(
      new AgentRegistry(path.join(tmpHome, "agents.json")),
      async () => processes,
    );
    kiroAdapter = new KiroAdapter();
    agyAdapter = new AntigravityCliAdapter();
    manager.registerAdapter(kiroAdapter);
    manager.registerAdapter(agyAdapter);
    resetReads();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalAgyHome === undefined) delete process.env.ANTIGRAVITY_CLI_HOME;
    else process.env.ANTIGRAVITY_CLI_HOME = originalAgyHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function summaryOf(agents: Awaited<ReturnType<AgentManager["listAgents"]>>, pid: number) {
    const agent = agents.find((candidate) => candidate.pid === pid);
    return { sessionId: agent?.sessionId, status: agent?.status, summary: agent?.summary };
  }

  it("reads 0 transcript bytes on a second refresh when nothing changed", async () => {
    const first = await manager.listAgents();
    expect(bytesReadFrom(kiroFile)).toBe(fs.statSync(kiroFile).size);
    expect(bytesReadFrom(agyFile)).toBe(fs.statSync(agyFile).size);
    expect(summaryOf(first, kiroPid).summary).toBe("first task");
    expect(summaryOf(first, agyPid).summary).toBe("first task");

    resetReads();
    const second = await manager.listAgents();

    expect(bytesReadFrom(kiroFile)).toBe(0);
    expect(bytesReadFrom(agyFile)).toBe(0);
    expect(summaryOf(second, kiroPid)).toEqual(summaryOf(first, kiroPid));
    expect(summaryOf(second, agyPid)).toEqual(summaryOf(first, agyPid));
  });

  it("reads at most the appended bytes plus 64 KiB after an append", async () => {
    await manager.listAgents();

    const kiroAppend = jsonl([kiroPrompt("follow-up task")]);
    const agyAppend = jsonl([agyRequest("follow-up task")]);
    fs.appendFileSync(kiroFile, kiroAppend);
    fs.appendFileSync(agyFile, agyAppend);

    resetReads();
    const agents = await manager.listAgents();

    expect(bytesReadFrom(kiroFile)).toBeGreaterThan(0);
    expect(bytesReadFrom(agyFile)).toBeGreaterThan(0);
    expect(bytesReadFrom(kiroFile)).toBeLessThanOrEqual(Buffer.byteLength(kiroAppend) + 64 * 1024);
    expect(bytesReadFrom(agyFile)).toBeLessThanOrEqual(Buffer.byteLength(agyAppend) + 64 * 1024);
    expect(summaryOf(agents, kiroPid).summary).toBe("follow-up task");
    expect(summaryOf(agents, agyPid).summary).toBe("follow-up task");
  });

  it("reads at most 5 MiB (+1 byte) of a large transcript on a cold refresh", async () => {
    const latest = new Date(startTime.getTime() + 60_000);
    const kiroHistory = jsonl(Array.from({ length: 48 }, () => kiroReply("h".repeat(256 * 1024))));
    const agyHistory = jsonl(Array.from({ length: 48 }, () => agyReply("h".repeat(256 * 1024))));
    fs.appendFileSync(kiroFile, kiroHistory + jsonl([kiroPrompt("latest kiro task", latest)]));
    fs.appendFileSync(agyFile, agyHistory + jsonl([agyRequest("latest agy task", latest)]));
    resetReads();

    const agents = await manager.listAgents();

    // 1 MiB head + 4 MiB tail, plus the byte before the tail window
    const limit = 5 * 1024 * 1024 + 1;
    expect(fs.statSync(kiroFile).size).toBeGreaterThan(2 * limit);
    expect(bytesReadFrom(kiroFile)).toBeLessThanOrEqual(limit);
    expect(bytesReadFrom(agyFile)).toBeLessThanOrEqual(limit);
    expect(summaryOf(agents, kiroPid).summary).toBe("latest kiro task");
    expect(summaryOf(agents, agyPid).summary).toBe("latest agy task");
  });

  it("evicts cache entries for transcripts absent from the latest refresh", async () => {
    await manager.listAgents();
    expect((kiroAdapter as any).parser.sessionCache.size).toBe(1);
    expect((agyAdapter as any).parser.sessionCache.size).toBe(1);

    processes = [];
    await manager.listAgents();

    expect((kiroAdapter as any).parser.sessionCache.size).toBe(0);
    expect((agyAdapter as any).parser.sessionCache.size).toBe(0);
  });
});
