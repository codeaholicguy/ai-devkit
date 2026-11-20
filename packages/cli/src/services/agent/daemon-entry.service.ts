import type { AgentRegistry, AgentType, AgentRuntimeProvider } from "@ai-devkit/agent-manager";
import type { AgentLookupResult } from "@ai-devkit/daemon-client";

export function createDaemonEntryRegistry(entry: AgentLookupResult): Pick<AgentRegistry, "lookup"> {
  const registryEntry = {
    name: entry.name,
    type: entry.type as AgentType,
    pid: entry.pid,
    runtime: entry.runtime as AgentRuntimeProvider,
    runtimeRef: entry.runtimeRef,
    cwd: entry.cwd,
    startedAt: "",
    sessionId: "",
    sessionFilePath: "",
    pinned: entry.pinned,
  };
  return { lookup: () => registryEntry };
}
