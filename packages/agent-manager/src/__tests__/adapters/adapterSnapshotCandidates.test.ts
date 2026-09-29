/**
 * Standalone snapshot enrichment tests (#281).
 *
 * When an adapter runs without a shared AgentDetectionContext it captures its
 * own process snapshot. `lsof` (cwd) and `ps lstart` (start time) must then
 * receive only the PIDs the adapter can handle — not every name-matched
 * process, which for `node`-based adapters means every Node.js process on the
 * machine. `child_process` is mocked so the real snapshot code runs on top.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as childProcess from "child_process";
import type { MockedFunction } from "vitest";

import type { AgentAdapter, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AntigravityCliAdapter } from "../../harnesses/antigravity/AntigravityCliAdapter.js";
import { KiroAdapter } from "../../harnesses/kiro/KiroAdapter.js";
import { ClaudeCodeAdapter } from "../../harnesses/claude/ClaudeCodeAdapter.js";
import { CodexAdapter } from "../../harnesses/codex/CodexAdapter.js";
import { CopilotAdapter } from "../../harnesses/copilot/CopilotAdapter.js";
import { GeminiCliAdapter } from "../../harnesses/gemini/GeminiCliAdapter.js";
import { GrokCliAdapter } from "../../harnesses/grok/GrokCliAdapter.js";
import { OpenCodeAdapter } from "../../harnesses/opencode/OpenCodeAdapter.js";
import { PiAdapter } from "../../harnesses/pi/PiAdapter.js";
import { AgentRegistry } from "../../utils/AgentRegistry.js";
import { captureProcessSnapshot } from "../../utils/process.js";

vi.mock("child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("child_process");
  return { ...actual, execFile: vi.fn() };
});

vi.mock("../../utils/process.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../utils/process.js");
  return { ...actual, captureProcessSnapshot: vi.fn(actual.captureProcessSnapshot) };
});

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

const mockedExecFile = childProcess.execFile as unknown as ReturnType<typeof vi.fn>;
const mockedCaptureProcessSnapshot = captureProcessSnapshot as MockedFunction<
  typeof captureProcessSnapshot
>;

/** Node processes that no adapter handles. */
const UNRELATED_NODE_LINES = [
  "901 1 ttys020 node server.js",
  "902 1 ttys021 node /usr/local/lib/node_modules/npm/bin/npm-cli.js install",
  "903 1 ?? node --inspect /srv/app/index.js",
];

function pidList(args: readonly string[]): number[] {
  return args[args.length - 1].split(",").map(Number);
}

function pidsSentTo(file: "lsof" | "ps"): number[][] {
  return mockedExecFile.mock.calls
    .filter(([name, args]) => name === file && (file === "lsof" || (args as string[])[0] === "-o"))
    .map(([, args]) => pidList(args as string[]));
}

function installExec(psLines: readonly string[]): void {
  mockedExecFile.mockImplementation(
    (file: string, args: readonly string[], _opts: unknown, cb: ExecFileCallback) => {
      if (file === "ps" && args[0] === "-axo") {
        cb(null, psLines.join("\n"), "");
      } else if (file === "lsof") {
        cb(
          null,
          pidList(args)
            .map((pid) => `p${pid}\nn/work/${pid}\n`)
            .join(""),
          "",
        );
      } else if (file === "ps" && args[0] === "-o") {
        cb(
          null,
          pidList(args)
            .map((pid) => `${pid} Wed Mar 18 23:18:01 2026\n`)
            .join(""),
          "",
        );
      } else {
        cb(new Error(`unexpected execFile ${file} ${args.join(" ")}`), "", "");
      }
    },
  );
}

interface AdapterCase {
  name: string;
  create: (home: string) => AgentAdapter;
  /** `ps -axo` lines for processes the adapter can handle. */
  candidates: string[];
  /** Name-matched processes the adapter keeps for parent chains but does not handle. */
  nonCandidates?: string[];
}

const registryIn = (home: string) => new AgentRegistry(path.join(home, "agents.json"));

const CASES: AdapterCase[] = [
  {
    name: "gemini (node)",
    create: (home) => new GeminiCliAdapter(registryIn(home), { geminiTmpDir: home }),
    candidates: ["1101 1 ttys001 node /usr/local/bin/gemini"],
  },
  {
    name: "pi (node)",
    create: (home) => new PiAdapter(registryIn(home)),
    candidates: ["1201 1 ttys002 node /usr/local/bin/pi"],
  },
  {
    name: "kiro (node)",
    create: () => new KiroAdapter(),
    candidates: ["1301 1 ttys003 kiro-cli"],
    nonCandidates: [
      "1302 1301 ttys003 kiro-cli-chat chat",
      "1303 1302 ttys003 bun --no-env-file /opt/kiro-cli/tui.js chat",
    ],
  },
  {
    name: "claude",
    create: () => new ClaudeCodeAdapter(),
    candidates: ["1401 1 ttys004 /usr/local/bin/claude"],
  },
  {
    name: "codex",
    create: (home) => new CodexAdapter(registryIn(home)),
    candidates: ["1501 1 ttys005 /opt/homebrew/bin/codex"],
  },
  {
    name: "copilot",
    create: (home) => new CopilotAdapter(registryIn(home)),
    candidates: ["1601 1 ttys006 copilot"],
  },
  {
    name: "grok",
    create: () => new GrokCliAdapter(),
    candidates: ["1701 1 ttys007 grok"],
  },
  {
    name: "opencode",
    create: (home) => new OpenCodeAdapter(path.join(home, "opencode.db")),
    candidates: ["1801 1 ttys008 opencode"],
  },
  {
    name: "antigravity",
    create: () => new AntigravityCliAdapter(),
    candidates: ["1901 1 ttys009 agy"],
  },
];

const leadingPid = (line: string) => Number(line.trim().split(/\s+/)[0]);

describe("adapter standalone snapshot candidate filtering", () => {
  let home: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-candidates-test-"));
    savedEnv = { HOME: process.env.HOME, ANTIGRAVITY_CLI_HOME: process.env.ANTIGRAVITY_CLI_HOME };
    process.env.HOME = home;
    process.env.ANTIGRAVITY_CLI_HOME = path.join(home, "antigravity");
    mockedExecFile.mockReset();
    mockedCaptureProcessSnapshot.mockClear();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });

  it.each(CASES)(
    "$name: lsof and ps lstart receive only candidate PIDs",
    async ({ create, candidates, nonCandidates = [] }) => {
      installExec([...candidates, ...nonCandidates, ...UNRELATED_NODE_LINES]);
      const adapter = create(home);
      const candidatePids = candidates.map(leadingPid);

      const agents = await adapter.detectAgents();

      expect(agents.map((agent) => agent.pid).sort()).toEqual(candidatePids);
      expect(pidsSentTo("lsof")).toEqual([candidatePids]);
      expect(pidsSentTo("ps")).toEqual([candidatePids]);
    },
  );

  it.each(CASES)(
    "$name: passes a canHandle-based isCandidate predicate",
    async ({ create, candidates }) => {
      installExec(candidates);
      const adapter = create(home);

      await adapter.detectAgents();

      expect(mockedCaptureProcessSnapshot).toHaveBeenCalledTimes(1);
      const isCandidate = mockedCaptureProcessSnapshot.mock.calls[0][1]?.isCandidate;
      expect(isCandidate).toBeTypeOf("function");
      const candidate: ProcessInfo = {
        pid: leadingPid(candidates[0]),
        command: candidates[0].trim().split(/\s+/).slice(3).join(" "),
        cwd: "",
        tty: "",
      };
      const unrelated: ProcessInfo = { pid: 901, command: "node server.js", cwd: "", tty: "" };
      expect(isCandidate?.(candidate)).toBe(true);
      expect(isCandidate?.(unrelated)).toBe(false);
    },
  );

  it("kiro: still walks an un-enriched kiro-cli-chat parent chain to the owning kiro-cli", async () => {
    const sessionsDir = path.join(home, ".kiro", "sessions", "cli");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, "sess-owner.lock"), JSON.stringify({ pid: 2303 }));
    fs.writeFileSync(
      path.join(sessionsDir, "sess-owner.jsonl"),
      `${JSON.stringify({
        kind: "Prompt",
        timestamp: new Date().toISOString(),
        data: { content: [{ kind: "text", data: "owned session" }] },
      })}\n`,
    );
    installExec([
      "2301 1 ttys010 kiro-cli",
      "2302 2301 ttys010 kiro-cli-chat chat",
      "2303 2302 ttys010 kiro-cli-chat acp",
      ...UNRELATED_NODE_LINES,
    ]);

    const agents = await new KiroAdapter().detectAgents();

    expect(agents).toEqual([
      expect.objectContaining({ pid: 2301, sessionId: "sess-owner", projectPath: "/work/2301" }),
    ]);
    expect(pidsSentTo("lsof")).toEqual([[2301]]);
    expect(pidsSentTo("ps")).toEqual([[2301]]);
  });
});
