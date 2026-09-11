import type { AgentRuntimeProvider } from "../utils/AgentRegistry.js";
import { HerdrAgentRuntime } from "./herdr/HerdrAgentRuntime.js";
import { TmuxAgentRuntime } from "./tmux/TmuxAgentRuntime.js";
import type { InteractiveAgentRuntime } from "./types.js";

function createHerdrRuntime(): InteractiveAgentRuntime {
  return new HerdrAgentRuntime();
}

export function createInteractiveRuntime(provider: AgentRuntimeProvider): InteractiveAgentRuntime {
  if (provider === "herdr") return createHerdrRuntime();
  return new TmuxAgentRuntime();
}
