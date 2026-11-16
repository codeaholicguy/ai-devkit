import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentAdapter,
  AgentDetectionContext,
  AgentInfo,
  ConversationMessage,
  ConversationOptions,
  ListSessionsOptions,
  ProcessInfo,
  SessionSummary,
} from "../../adapters/AgentAdapter.js";
import { AgentRegistry } from "../../utils/AgentRegistry.js";
import { findHarnessProcesses, homeDir, processOnlyAgent } from "../shared.js";
import { PiSessionLocator } from "../pi/PiSessionLocator.js";
import { PiSessionParser, type PiSession } from "../pi/PiSessionParser.js";
import { generateAgentName } from "../../utils/matching.js";
import { matchesOmpCommand } from "../runtimeProfiles.js";

interface SessionFileMatch {
  process: ProcessInfo;
  filePath: string;
}

interface MappedAgentResult {
  agents: AgentInfo[];
  fallback: ProcessInfo[];
}

/** Adapter for oh-my-pi (OMP), whose transcript format is Pi-compatible. */
export class OmpAdapter implements AgentAdapter {
  readonly type = "omp" as const;
  readonly processNames = ["omp", "bun", "node"] as const;

  private readonly sessionsDirs: readonly string[];
  private readonly registry: AgentRegistry;
  private readonly parser: PiSessionParser;
  private readonly liveLocator: PiSessionLocator;

  constructor(registry: AgentRegistry = AgentRegistry.default()) {
    this.sessionsDirs = resolveOmpSessionDirs();
    this.registry = registry;
    this.parser = new PiSessionParser();
    this.liveLocator = this.createLocator();
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return matchesOmpCommand(processInfo.command);
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    try {
      const processes = (await findHarnessProcesses(this, context)).processes;
      if (processes.length === 0) return [];

      const cacheResult = this.mapRegistryCache(processes);
      const locatorResult = this.liveLocator.matchRunningProcesses(cacheResult.fallback);
      const legacyResult = this.mapLegacyMatches(locatorResult.legacyMatches);
      const unmatchedProcesses = this.findUnmatchedProcesses(
        locatorResult.fallback,
        legacyResult.agents,
      );

      return [
        ...cacheResult.agents,
        ...legacyResult.agents,
        ...unmatchedProcesses.map((processInfo) =>
          processOnlyAgent("omp", processInfo, { summary: "OMP process running" }),
        ),
      ];
    } finally {
      this.parser.pruneSessionCache();
    }
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];
    for (const filePath of this.createLocator().discoverHistoricalSessionFiles()) {
      const summary = this.parser.fileToSessionSummary(filePath);
      if (!summary || (opts?.cwd !== undefined && summary.cwd !== opts.cwd)) continue;
      summaries.push({ ...summary, type: "omp" });
    }
    return summaries;
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    const matches: SessionSummary[] = [];
    for (const filePath of this.createLocator().findHistoricalSessionFilesById(sessionId)) {
      const summary = this.parser.fileToSessionSummary(filePath);
      if (summary?.sessionId === sessionId) matches.push({ ...summary, type: "omp" });
    }
    return matches.length > 0
      ? matches
      : (await this.listSessions()).filter((s) => s.sessionId === sessionId);
  }

  private createLocator(): PiSessionLocator {
    return new PiSessionLocator(
      { sessionsDirs: this.sessionsDirs, encodeProjectDir: encodeOmpProjectDir },
      this.parser,
    );
  }

  private mapRegistryCache(processes: ProcessInfo[]): MappedAgentResult {
    const matches: SessionFileMatch[] = [];
    const fallback: ProcessInfo[] = [];
    const byPid = new Map(this.registry.list().map((entry) => [entry.pid, entry]));

    for (const processInfo of processes) {
      const entry = byPid.get(processInfo.pid);
      if (
        !entry ||
        entry.type !== this.type ||
        !entry.sessionFilePath ||
        !this.isSessionFile(entry.sessionFilePath) ||
        !fs.existsSync(entry.sessionFilePath)
      ) {
        fallback.push(processInfo);
        continue;
      }
      matches.push({ process: processInfo, filePath: entry.sessionFilePath });
    }

    return this.mapSessionFileMatches(matches, fallback);
  }

  private mapLegacyMatches(
    matches: Array<{ process: ProcessInfo; session: { filePath: string } }>,
  ): MappedAgentResult {
    return this.mapSessionFileMatches(
      matches.map((match) => ({ process: match.process, filePath: match.session.filePath })),
      [],
    );
  }

  private mapSessionFileMatches(
    matches: SessionFileMatch[],
    fallback: ProcessInfo[],
  ): MappedAgentResult {
    const agents: AgentInfo[] = [];
    const unresolved = [...fallback];
    for (const match of matches) {
      const session = this.parser.readSessionIncremental(match.filePath, match.process.cwd);
      if (session) agents.push(this.mapSessionToAgent(session, match.process, match.filePath));
      else unresolved.push(match.process);
    }
    return { agents, fallback: unresolved };
  }

  private mapSessionToAgent(
    session: PiSession,
    processInfo: ProcessInfo,
    filePath: string,
  ): AgentInfo {
    const projectPath = session.projectPath || processInfo.cwd || "";
    return {
      name: generateAgentName(projectPath, processInfo.pid),
      type: "omp",
      status: this.parser.determineStatus(session),
      summary: session.summary === "Pi session active" ? "OMP session active" : session.summary,
      pid: processInfo.pid,
      projectPath,
      sessionId: session.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: filePath,
    };
  }

  private findUnmatchedProcesses(processes: ProcessInfo[], agents: AgentInfo[]): ProcessInfo[] {
    const matchedPids = new Set(agents.map((agent) => agent.pid));
    return processes.filter((processInfo) => !matchedPids.has(processInfo.pid));
  }

  private isSessionFile(filePath: string): boolean {
    const candidate = path.resolve(filePath);
    return this.sessionsDirs.some((sessionsDir) => {
      const root = path.resolve(sessionsDir);
      return candidate.startsWith(`${root}${path.sep}`);
    });
  }
}

function resolveOmpSessionDirs(home = homeDir()): string[] {
  const override = process.env.PI_CODING_AGENT_DIR;
  if (override) return [path.resolve(override, "sessions")];

  const configRoot = path.resolve(home, process.env.PI_CONFIG_DIR ?? ".omp");
  const roots = [path.join(configRoot, "agent", "sessions")];
  addProfileSessionDirs(roots, path.join(configRoot, "profiles"), "agent");

  if (process.platform === "linux" || process.platform === "darwin") {
    const xdgDataHome = process.env.XDG_DATA_HOME;
    if (xdgDataHome) {
      const xdgRoot = path.resolve(xdgDataHome, "omp");
      roots.push(path.join(xdgRoot, "sessions"));
      addProfileSessionDirs(roots, path.join(xdgRoot, "profiles"), undefined);
    }
  }

  return [...new Set(roots.map((root) => path.resolve(root)))];
}

function addProfileSessionDirs(
  roots: string[],
  profilesRoot: string,
  agentSegment: string | undefined,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(profilesRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    roots.push(
      path.join(
        profilesRoot,
        entry.name,
        ...(agentSegment === undefined ? ["sessions"] : [agentSegment, "sessions"]),
      ),
    );
  }
}

function encodeOmpProjectDir(cwd: string): string {
  const normalized = canonicalPath(path.resolve(cwd));
  const home = canonicalPath(path.resolve(homeDir()));
  const relative = path.relative(home, normalized);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `-${relative.replaceAll(path.sep, "-").replaceAll("/", "-")}`;
  }
  const outsideHome = normalized
    .replace(/^[/\\]+/, "")
    .replaceAll(path.sep, "-")
    .replaceAll("/", "-");
  return `--${outsideHome}--`;
}

function canonicalPath(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return value;
  }
}
