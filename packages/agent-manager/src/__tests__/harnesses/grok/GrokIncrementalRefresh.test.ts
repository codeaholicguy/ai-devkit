/**
 * Refresh-path I/O tests for the Grok adapter: repeated `detectAgents()` calls
 * must only read chat_history.jsonl bytes that changed since the last refresh.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { GrokCliAdapter } from "../../../harnesses/grok/GrokCliAdapter.js";

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

const userRecord = (text: string) => ({
  type: "user",
  content: [{ type: "text", text: `<user_query>\n${text}\n</user_query>` }],
});
const assistantRecord = (text: string) => ({
  type: "assistant",
  content: [{ type: "text", text }],
});

describe("Grok incremental transcript reads across detectAgents() refreshes", () => {
  let originalHome: string | undefined;
  let originalGrokHome: string | undefined;
  let tmpHome: string;
  let chatFile: string;
  let adapter: GrokCliAdapter;
  let processes: ProcessInfo[];

  const pid = 73001;
  const cwd = "/repo/grok";

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalGrokHome = process.env.GROK_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "grok-incremental-refresh-"));
    process.env.HOME = tmpHome;
    delete process.env.GROK_HOME;

    const sessionDir = path.join(
      tmpHome,
      ".grok",
      "sessions",
      encodeURIComponent(cwd),
      "019f16c3-0000-7000-8000-000000000001",
    );
    fs.mkdirSync(sessionDir, { recursive: true });
    chatFile = path.join(sessionDir, "chat_history.jsonl");
    // Large, newline-terminated transcript; the last record is left unterminated
    // the way the existing Grok fixtures write it.
    fs.writeFileSync(
      chatFile,
      [
        userRecord("first task"),
        assistantRecord("x".repeat(300_000)),
        { type: "user", content: [{ type: "text", text: "<user_info>OS</user_info>" }] },
        userRecord("second task"),
      ]
        .map((record) => JSON.stringify(record))
        .join("\n"),
    );
    fs.writeFileSync(
      path.join(tmpHome, ".grok", "active_sessions.json"),
      JSON.stringify([{ pid, cwd, opened_at: 1 }]),
    );

    processes = [{ pid, command: "grok", cwd, tty: "ttys003", startTime: new Date() }];
    adapter = new GrokCliAdapter();
    resetReads();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalGrokHome === undefined) delete process.env.GROK_HOME;
    else process.env.GROK_HOME = originalGrokHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  const detect = () => adapter.detectAgents({ processes });
  const summaryOf = (agents: Awaited<ReturnType<typeof detect>>) => ({
    sessionId: agents[0]?.sessionId,
    status: agents[0]?.status,
    summary: agents[0]?.summary,
  });

  it("reads 0 transcript bytes on a second refresh when nothing changed", async () => {
    const first = await detect();
    expect(bytesReadFrom(chatFile)).toBe(fs.statSync(chatFile).size);
    expect(first[0].summary).toBe("second task");

    resetReads();
    const second = await detect();

    expect(bytesReadFrom(chatFile)).toBe(0);
    expect(summaryOf(second)).toEqual(summaryOf(first));
  });

  it("reads at most the appended bytes plus 64 KiB after an append", async () => {
    await detect();

    const append = `\n${JSON.stringify(assistantRecord("done"))}\n${JSON.stringify(
      userRecord("follow-up task"),
    )}\n`;
    fs.appendFileSync(chatFile, append);

    resetReads();
    const agents = await detect();

    expect(bytesReadFrom(chatFile)).toBeGreaterThan(0);
    expect(bytesReadFrom(chatFile)).toBeLessThanOrEqual(Buffer.byteLength(append) + 64 * 1024);
    expect(agents[0].summary).toBe("follow-up task");
  });

  it("evicts cache entries for transcripts absent from the latest refresh", async () => {
    await detect();
    expect((adapter as any).parser.sessionCache.size).toBe(1);

    processes = [];
    await detect();

    expect((adapter as any).parser.sessionCache.size).toBe(0);
  });
});
