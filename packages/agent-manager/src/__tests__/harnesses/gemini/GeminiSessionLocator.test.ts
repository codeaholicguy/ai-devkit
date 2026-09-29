/**
 * I/O-bounded discovery tests for GeminiSessionLocator (issue #263).
 *
 * `fs` is wrapped so every open/read is recorded, which lets the tests
 * assert exactly which chat files discovery touches and how many bytes
 * of chat content it reads per refresh.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { GeminiCliAdapter } from "../../../harnesses/gemini/GeminiCliAdapter.js";
import { GeminiSessionLocator } from "../../../harnesses/gemini/GeminiSessionLocator.js";
import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { AgentRegistry } from "../../../utils/AgentRegistry.js";

vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs");
  const wrapped = {
    ...actual,
    openSync: vi.fn(actual.openSync),
    readSync: vi.fn(actual.readSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
  return { ...wrapped, default: wrapped };
});

const DAY_MS = 24 * 60 * 60 * 1000;

interface IoLog {
  /** Paths passed to openSync/readFileSync, in call order. */
  opened: string[];
  /** Bytes returned by readSync/readFileSync, keyed by path. */
  bytesByPath: Map<string, number>;
}

function startIoLog(): IoLog {
  const log: IoLog = { opened: [], bytesByPath: new Map() };
  const fdPaths = new Map<number, string>();
  const openSync = vi.mocked(fs.openSync);
  const readSync = vi.mocked(fs.readSync);
  const readFileSync = vi.mocked(fs.readFileSync);

  const addBytes = (p: string, n: number) =>
    log.bytesByPath.set(p, (log.bytesByPath.get(p) ?? 0) + n);

  openSync.mockImplementation(((p: fs.PathLike, ...rest: unknown[]) => {
    const fd = (fsActual.openSync as (...args: unknown[]) => number)(p, ...rest);
    log.opened.push(String(p));
    fdPaths.set(fd, String(p));
    return fd;
  }) as typeof fs.openSync);
  readSync.mockImplementation(((fd: number, ...rest: unknown[]) => {
    const n = (fsActual.readSync as (...args: unknown[]) => number)(fd, ...rest);
    addBytes(fdPaths.get(fd) ?? `fd:${fd}`, n);
    return n;
  }) as typeof fs.readSync);
  readFileSync.mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    const result = (fsActual.readFileSync as (...args: unknown[]) => string | Buffer)(p, ...rest);
    log.opened.push(String(p));
    addBytes(String(p), Buffer.byteLength(result));
    return result;
  }) as typeof fs.readFileSync);
  return log;
}

let fsActual: typeof import("fs");

function chatBytes(log: IoLog): number {
  let total = 0;
  for (const [p, n] of log.bytesByPath) {
    if (isChatFile(p)) total += n;
  }
  return total;
}

function openedChatFiles(log: IoLog): string[] {
  return [...new Set(log.opened.filter(isChatFile))].sort();
}

function isChatFile(p: string): boolean {
  return path.basename(path.dirname(p)) === "chats";
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeChat(
  tmpDir: string,
  dirName: string,
  fileName: string,
  body: Record<string, unknown>,
  mtime?: Date,
): string {
  const chatsDir = path.join(tmpDir, dirName, "chats");
  fsActual.mkdirSync(chatsDir, { recursive: true });
  const filePath = path.join(chatsDir, fileName);
  // Gemini CLI writes the legacy .json format with 2-space indentation.
  fsActual.writeFileSync(filePath, JSON.stringify(body, null, 2));
  if (mtime) fsActual.utimesSync(filePath, mtime, mtime);
  return filePath;
}

function writeProjectMarker(tmpDir: string, dirName: string, projectRoot: string): void {
  fsActual.mkdirSync(path.join(tmpDir, dirName), { recursive: true });
  fsActual.writeFileSync(path.join(tmpDir, dirName, ".project_root"), projectRoot);
}

function sessionBody(projectRoot: string, sessionId: string, extraMessages = 1) {
  const now = new Date().toISOString();
  return {
    sessionId,
    projectHash: sha256(projectRoot),
    startTime: now,
    lastUpdated: now,
    kind: "main",
    directories: [projectRoot],
    messages: Array.from({ length: extraMessages }, (_, i) => ({
      id: `m${i}`,
      timestamp: now,
      type: "user",
      content: [{ text: `message ${i} for ${sessionId}` }],
    })),
  };
}

function geminiProcess(pid: number, cwd: string, startTime = new Date()): ProcessInfo {
  return { pid, command: "node /usr/local/bin/gemini", cwd, tty: "ttys001", startTime };
}

describe("GeminiSessionLocator — bounded discovery (#263)", () => {
  let tmpHome: string;
  let tmpDir: string;
  let locator: GeminiSessionLocator;

  beforeAll(async () => {
    fsActual = await vi.importActual<typeof import("fs")>("fs");
  });

  beforeEach(() => {
    tmpHome = fsActual.mkdtempSync(path.join(os.tmpdir(), "gemini-locator-test-"));
    tmpDir = path.join(tmpHome, ".gemini", "tmp");
    fsActual.mkdirSync(tmpDir, { recursive: true });
    locator = new GeminiSessionLocator({ geminiTmpDir: tmpDir });
  });

  afterEach(() => {
    fsActual.rmSync(tmpHome, { recursive: true, force: true });
  });

  /**
   * 20 projects x 25 chats = 500 historical fixtures. Half the projects use
   * Gemini's current slug + `.project_root` layout, half the legacy
   * sha256(projectRoot) directory name. Every project has fresh files so
   * only directory pruning (not the mtime window) can exclude them.
   */
  function seedHistory(): { liveRoot: string; liveRecent: string } {
    const old = new Date(Date.now() - 3 * DAY_MS);
    let liveRecent = "";
    const liveRoot = "/work/project-07";

    for (let p = 0; p < 20; p++) {
      const root = `/work/project-${String(p).padStart(2, "0")}`;
      const dirName = p % 2 === 1 ? `project-${String(p).padStart(2, "0")}` : sha256(root);
      if (p % 2 === 1) writeProjectMarker(tmpDir, dirName, root);

      for (let f = 0; f < 25; f++) {
        const isRecent = f === 24;
        const filePath = writeChat(
          tmpDir,
          dirName,
          `session-2026-09-${String(f + 1).padStart(2, "0")}T00-00-${p}-${f}.json`,
          sessionBody(root, `s-${p}-${f}`),
          isRecent ? undefined : old,
        );
        if (root === liveRoot && isRecent) liveRecent = filePath;
      }
    }
    return { liveRoot, liveRecent };
  }

  it("opens only the live process's project chat files inside the mtime window", () => {
    const { liveRoot, liveRecent } = seedHistory();
    const log = startIoLog();

    const result = locator.discoverSessions([geminiProcess(1, liveRoot)]);

    expect(result.sessions.map((s) => s.filePath)).toEqual([liveRecent]);
    expect(result.sessions[0]).toMatchObject({ sessionId: "s-7-24", resolvedCwd: liveRoot });
    expect(openedChatFiles(log)).toEqual([liveRecent]);
  });

  it("prunes legacy hash-named project dirs without opening their chats", () => {
    const { liveRecent } = seedHistory();
    const legacyRoot = "/work/project-04"; // even index => sha256-named dir
    const log = startIoLog();

    const result = locator.discoverSessions([geminiProcess(1, legacyRoot)]);

    expect(result.sessions.map((s) => s.sessionId)).toEqual(["s-4-24"]);
    const opened = openedChatFiles(log);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain(sha256(legacyRoot));
    expect(opened).not.toContain(liveRecent);
  });

  it("does not expose a content cache and reads only a bounded head of large chats", () => {
    const root = "/work/big";
    const bigPath = writeChat(tmpDir, "big", "session-big.json", sessionBody(root, "s-big", 4000));
    const size = fsActual.statSync(bigPath).size;
    expect(size).toBeGreaterThan(256 * 1024);
    const log = startIoLog();

    const result = locator.discoverSessions([geminiProcess(1, root)]);

    expect(result.sessions.map((s) => s.sessionId)).toEqual(["s-big"]);
    expect(result).not.toHaveProperty("contentCache");
    expect(chatBytes(log)).toBeLessThanOrEqual(16 * 1024);
  });

  it("reads 0 bytes of chat content on a refresh when files are unchanged", () => {
    seedHistory();
    const proc = geminiProcess(1, "/work/project-07");
    const first = locator.discoverSessions([proc]);
    const log = startIoLog();

    const second = locator.discoverSessions([proc]);

    expect(second.sessions).toEqual(first.sessions);
    expect(chatBytes(log)).toBe(0);
    expect(log.opened).toEqual([]);
  });

  it("re-reads metadata once a cached chat file changes", () => {
    const root = "/work/changing";
    const filePath = writeChat(tmpDir, "changing", "session-c.json", sessionBody(root, "s-1"));
    const proc = geminiProcess(1, root);
    expect(locator.discoverSessions([proc]).sessions[0].sessionId).toBe("s-1");

    fsActual.writeFileSync(filePath, JSON.stringify(sessionBody(root, "s-2", 3), null, 2));
    const log = startIoLog();

    expect(locator.discoverSessions([proc]).sessions[0].sessionId).toBe("s-2");
    expect(chatBytes(log)).toBeGreaterThan(0);
  });

  it("falls back to scanning dirs without a recognisable layout", () => {
    const root = "/work/unknown-layout";
    writeChat(tmpDir, "opaque", "session-u.json", sessionBody(root, "s-u"));

    const result = locator.discoverSessions([geminiProcess(1, root)]);

    expect(result.sessions.map((s) => s.sessionId)).toEqual(["s-u"]);
  });

  it("skips slug dirs whose .project_root names a different project", () => {
    writeProjectMarker(tmpDir, "other", "/work/other");
    writeChat(tmpDir, "other", "session-o.json", sessionBody("/work/mine", "s-o"));
    const log = startIoLog();

    const result = locator.discoverSessions([geminiProcess(1, "/work/mine")]);

    expect(result.sessions).toEqual([]);
    expect(openedChatFiles(log)).toEqual([]);
  });

  it("matches a subdirectory process against the project-root marker", () => {
    writeProjectMarker(tmpDir, "mono", "/work/mono");
    writeChat(tmpDir, "mono", "session-m.json", sessionBody("/work/mono", "s-m"));

    const result = locator.discoverSessions([geminiProcess(1, "/work/mono/packages/a")]);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].resolvedCwd).toBe("/work/mono/packages/a");
  });

  it("does not apply an mtime window when no process has a start time", () => {
    const root = "/work/nostart";
    writeChat(
      tmpDir,
      "nostart",
      "session-n.json",
      sessionBody(root, "s-n"),
      new Date(Date.now() - 30 * DAY_MS),
    );
    const proc: ProcessInfo = { pid: 1, command: "gemini", cwd: root, tty: "ttys001" };

    expect(locator.discoverSessions([proc]).sessions.map((s) => s.sessionId)).toEqual(["s-n"]);
  });

  it("keeps sessions modified within the matching tolerance before process start", () => {
    const root = "/work/tolerance";
    const start = new Date();
    writeChat(
      tmpDir,
      "tolerance",
      "session-t.json",
      sessionBody(root, "s-t"),
      new Date(start.getTime() - 60 * 1000),
    );

    const result = locator.discoverSessions([geminiProcess(1, root, start)]);

    expect(result.sessions.map((s) => s.sessionId)).toEqual(["s-t"]);
  });

  it("falls back to a full parse when the head lacks the metadata keys", () => {
    const root = "/work/late-keys";
    const chatsDir = path.join(tmpDir, "late", "chats");
    fsActual.mkdirSync(chatsDir, { recursive: true });
    const body = {
      messages: Array.from({ length: 2000 }, (_, i) => ({ id: `m${i}`, type: "user" })),
      sessionId: "s-late",
      projectHash: sha256(root),
    };
    fsActual.writeFileSync(path.join(chatsDir, "session-late.json"), JSON.stringify(body));

    const result = locator.discoverSessions([geminiProcess(1, root)]);

    expect(result.sessions.map((s) => s.sessionId)).toEqual(["s-late"]);
  });
});

describe("GeminiCliAdapter — refresh I/O (#263)", () => {
  let tmpHome: string;

  beforeAll(async () => {
    fsActual = await vi.importActual<typeof import("fs")>("fs");
  });

  beforeEach(() => {
    tmpHome = fsActual.mkdtempSync(path.join(os.tmpdir(), "gemini-adapter-io-test-"));
  });

  afterEach(() => {
    fsActual.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("reads 0 bytes of chat content on the second detectAgents with unchanged files", async () => {
    const tmpDir = path.join(tmpHome, ".gemini", "tmp");
    const root = "/work/live";
    writeProjectMarker(tmpDir, "live", root);
    const sessionPath = writeChat(tmpDir, "live", "session-live.json", sessionBody(root, "s-live"));
    for (let i = 0; i < 10; i++) {
      writeChat(
        tmpDir,
        "live",
        `session-old-${i}.json`,
        sessionBody(root, `s-old-${i}`),
        new Date(Date.now() - 2 * DAY_MS),
      );
    }

    const adapter = new GeminiCliAdapter(new AgentRegistry(path.join(tmpHome, "agents.json")), {
      geminiTmpDir: tmpDir,
    });
    const context = { processes: [geminiProcess(4242, root)] };

    const first = await adapter.detectAgents(context);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ sessionId: "s-live", sessionFilePath: sessionPath });

    const log = startIoLog();
    const second = await adapter.detectAgents(context);

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      sessionId: first[0].sessionId,
      sessionFilePath: first[0].sessionFilePath,
      summary: first[0].summary,
    });
    expect(chatBytes(log)).toBe(0);
  });

  it("re-parses the matched session after it is appended to", async () => {
    const tmpDir = path.join(tmpHome, ".gemini", "tmp");
    const root = "/work/appending";
    writeProjectMarker(tmpDir, "appending", root);
    const sessionPath = writeChat(tmpDir, "appending", "session-a.json", sessionBody(root, "s-a"));
    const adapter = new GeminiCliAdapter(new AgentRegistry(path.join(tmpHome, "agents.json")), {
      geminiTmpDir: tmpDir,
    });
    const context = { processes: [geminiProcess(4343, root)] };

    const first = await adapter.detectAgents(context);
    expect(first[0].summary).toBe("message 0 for s-a");

    fsActual.writeFileSync(sessionPath, JSON.stringify(sessionBody(root, "s-a", 3), null, 2));
    const second = await adapter.detectAgents(context);

    expect(second[0]).toMatchObject({ sessionId: "s-a", summary: "message 2 for s-a" });
  });
});
