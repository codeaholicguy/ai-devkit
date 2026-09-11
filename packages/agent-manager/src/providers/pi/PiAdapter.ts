import * as fs from "fs";
import * as path from "path";
import type {
  AgentAdapter,
  AgentInfo,
  ProcessInfo,
  ConversationMessage,
  SessionSummary,
  ListSessionsOptions,
  AgentDetectionContext,
} from "../../adapters/AgentAdapter.js";
import {
  captureProcessSnapshot,
  executableBasename,
  filterByProcessNames,
} from "../../utils/process.js";
import { AgentRegistry } from "../../utils/AgentRegistry.js";
import { PiAgentMapper } from "./PiAgentMapper.js";
import { PiSessionLocator } from "./PiSessionLocator.js";
import { PiSessionParser } from "./PiSessionParser.js";
import { PiSessionTracker } from "./PiSessionTracker.js";

interface MappedAgentResult {
  agents: AgentInfo[];
  fallback: ProcessInfo[];
}

interface SessionFileMatch {
  process: ProcessInfo;
  filePath: string;
}

export class PiAdapter implements AgentAdapter {
  readonly type = "pi" as const;
  readonly processNames = ["pi", "node"] as const;

  private readonly piSessionsDir: string;
  private readonly trackerPath: string;
  private readonly registry: AgentRegistry;
  private readonly parser: PiSessionParser;
  private readonly mapper: PiAgentMapper;

  constructor(registry: AgentRegistry = AgentRegistry.default()) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const piAgentDir = path.join(homeDir, ".pi", "agent");
    this.piSessionsDir = path.join(piAgentDir, "sessions");
    this.trackerPath = path.join(piAgentDir, "sessions.json");
    this.registry = registry;
    this.parser = new PiSessionParser();
    this.mapper = new PiAgentMapper(this.parser);
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return this.isPiExecutable(processInfo.command);
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const processes = await this.getPiProcesses(context);
    if (processes.length === 0) return [];

    const cacheResult = this.mapRegistryCache(processes);
    const trackerResult = this.mapTrackerMatches(cacheResult.fallback);
    const locatorResult = this.createLocator().matchRunningProcesses(trackerResult.fallback);
    const legacyResult = this.mapLegacyMatches(locatorResult.legacyMatches);
    const unmatchedProcesses = this.findUnmatchedProcesses(
      locatorResult.fallback,
      legacyResult.agents,
    );

    return [
      ...cacheResult.agents,
      ...trackerResult.agents,
      ...legacyResult.agents,
      ...unmatchedProcesses.map((processInfo) => this.mapper.mapProcessOnlyAgent(processInfo)),
    ];
  }

  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    for (const filePath of this.createLocator().discoverHistoricalSessionFiles()) {
      const summary = this.parser.fileToSessionSummary(filePath);
      if (!summary) continue;
      if (opts?.cwd !== undefined && summary.cwd !== opts.cwd) continue;
      summaries.push(summary);
    }

    return summaries;
  }

  private async getPiProcesses(context?: AgentDetectionContext): Promise<ProcessInfo[]> {
    const snapshot = context?.processes ?? (await captureProcessSnapshot(this.processNames));
    const relevant = filterByProcessNames(snapshot, this.processNames);

    const byPid = new Map<number, ProcessInfo>();
    for (const processInfo of relevant) {
      if (this.canHandle(processInfo)) byPid.set(processInfo.pid, processInfo);
    }
    return Array.from(byPid.values());
  }

  private createLocator(): PiSessionLocator {
    return new PiSessionLocator({ sessionsDir: this.piSessionsDir }, this.parser);
  }

  private createTracker(): PiSessionTracker {
    return new PiSessionTracker({
      sessionsDir: this.piSessionsDir,
      trackerPath: this.trackerPath,
    });
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
        !fs.existsSync(entry.sessionFilePath)
      ) {
        fallback.push(processInfo);
        continue;
      }

      matches.push({ process: processInfo, filePath: entry.sessionFilePath });
    }

    const mapped = this.mapSessionFileMatches(matches);
    return { agents: mapped.agents, fallback: [...fallback, ...mapped.fallback] };
  }

  private mapTrackerMatches(processes: ProcessInfo[]): MappedAgentResult {
    const { matches, fallback } = this.createTracker().match(processes);
    const mapped = this.mapSessionFileMatches(matches);
    return { agents: mapped.agents, fallback: [...fallback, ...mapped.fallback] };
  }

  private mapLegacyMatches(
    matches: Array<{ process: ProcessInfo; session: { filePath: string } }>,
  ): MappedAgentResult {
    return this.mapSessionFileMatches(
      matches.map((match) => ({ process: match.process, filePath: match.session.filePath })),
    );
  }

  private mapSessionFileMatches(matches: SessionFileMatch[]): MappedAgentResult {
    const agents: AgentInfo[] = [];
    const fallback: ProcessInfo[] = [];

    for (const match of matches) {
      const session = this.parser.readSession(match.filePath, match.process.cwd);
      if (session) {
        agents.push(this.mapper.mapSessionToAgent(session, match.process, match.filePath));
      } else {
        fallback.push(match.process);
      }
    }

    return { agents, fallback };
  }

  private findUnmatchedProcesses(processes: ProcessInfo[], agents: AgentInfo[]): ProcessInfo[] {
    const matchedPids = new Set(agents.map((agent) => agent.pid));
    return processes.filter((processInfo) => !matchedPids.has(processInfo.pid));
  }

  private isPiExecutable(command: string): boolean {
    for (const token of command.trim().split(/\s+/)) {
      const base = executableBasename(token);
      if (base === "pi" || base === "pi.exe" || base === "pi.js") return true;
    }
    return false;
  }
}
