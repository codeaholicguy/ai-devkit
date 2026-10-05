import type { AgentAdapter } from "../adapters/AgentAdapter.js";
import { AntigravityCliAdapter } from "./antigravity/AntigravityCliAdapter.js";
import { ClaudeCodeAdapter } from "./claude/ClaudeCodeAdapter.js";
import { CodexAdapter } from "./codex/CodexAdapter.js";
import { CopilotAdapter } from "./copilot/CopilotAdapter.js";
import { GeminiCliAdapter } from "./gemini/GeminiCliAdapter.js";
import { GrokCliAdapter } from "./grok/GrokCliAdapter.js";
import { KiroAdapter } from "./kiro/KiroAdapter.js";
import { OpenCodeAdapter } from "./opencode/OpenCodeAdapter.js";
import { PiAdapter } from "./pi/PiAdapter.js";
import { DevinAdapter } from "./devin/DevinAdapter.js";

/**
 * One instance of every built-in harness adapter, in registration order
 * (which is also the order agents are listed in). Register a new harness here.
 */
export function createBuiltinAdapters(): AgentAdapter[] {
  return [
    new ClaudeCodeAdapter(),
    new CodexAdapter(),
    new CopilotAdapter(),
    new GeminiCliAdapter(),
    new GrokCliAdapter(),
    new KiroAdapter(),
    new AntigravityCliAdapter(),
    new OpenCodeAdapter(),
    new PiAdapter(),
    new DevinAdapter(),
  ];
}
