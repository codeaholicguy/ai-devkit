import {
  HARNESS_RUNTIME_PROFILES,
  parseTmuxRuntimeRef,
  startAgent,
  TerminalFocusManager,
  type StartableAgentType,
} from "@ai-devkit/agent-manager";
import { sendToAgent } from "../agent/agent.service.js";
import { createAgentManager } from "../../commands/agent/factory.js";
import { ConfigManager } from "../../lib/Config.js";
import { type AgentRuntimeProvider } from "../../util/config.js";
import { commandExistsOnPath } from "../../util/executable.js";
import { createTmuxInspectionDeps } from "../../util/tmux-deps.js";
import { resolveTmuxInstallInstructions } from "../../util/tmux.js";
import { ui as defaultUi } from "../../util/terminal-ui.js";

export const DEMO_LEAD_NAME = "demo-lead";
export const DEMO_WORKER_NAME = "demo-worker";
export const DEMO_TOKEN = "devkit-demo-ok";
export const DEMO_WORKER_PROMPT = `Reply with exactly: ${DEMO_TOKEN}`;

const DEMO_HARNESS_PREFERENCE_BASE: StartableAgentType[] = [
  "claude",
  "codex",
  "opencode",
  "pi",
  "copilot",
  "gemini_cli",
  "grok_cli",
  "antigravity_cli",
  "kiro",
  "devin",
  "muse",
];

/** Stable preference when more than two harness CLIs are on PATH. */
export const DEMO_HARNESS_PREFERENCE: StartableAgentType[] = [
  ...DEMO_HARNESS_PREFERENCE_BASE,
  ...(Object.keys(HARNESS_RUNTIME_PROFILES) as StartableAgentType[]).filter(
    (type) => !DEMO_HARNESS_PREFERENCE_BASE.includes(type),
  ),
];

export interface StartedDemoAgent {
  name: string;
  type: StartableAgentType;
  pid: number;
  attach?: string;
}

export interface InitDemoSendResult {
  messages: Array<{ role: string; content: string }>;
  agentName: string;
  agentType: string;
}

export interface InitDemoUi {
  text(message: string, options?: { breakline?: boolean }): void;
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
  warning(message: string): void;
  breakline(): void;
}

export interface InitDemoDeps {
  platform: NodeJS.Platform;
  commandExists: (command: string) => boolean;
  resolveTmuxInstall: () => Promise<{ command: string | null; message: string }>;
  getRuntimeProvider: () => Promise<AgentRuntimeProvider>;
  startAgent: typeof startAgent;
  sendToAgent: typeof sendToAgent;
  createManager: typeof createAgentManager;
  createFocusManager: () => TerminalFocusManager;
  ui: InitDemoUi;
}

export function listInstalledHarnessTypes(
  commandExists: (command: string) => boolean = commandExistsOnPath,
): StartableAgentType[] {
  const seen = new Set<StartableAgentType>();
  const installed: StartableAgentType[] = [];
  for (const type of DEMO_HARNESS_PREFERENCE) {
    if (seen.has(type)) continue;
    seen.add(type);
    if (commandExists(HARNESS_RUNTIME_PROFILES[type].command)) {
      installed.push(type);
    }
  }
  return installed;
}

export function pickDemoHarnessPair(
  installed: StartableAgentType[],
): { lead: StartableAgentType; worker: StartableAgentType } | null {
  if (installed.length < 2) return null;
  return { lead: installed[0], worker: installed[1] };
}

export function formatInsufficientHarnessesMessage(installed: StartableAgentType[]): string {
  const found =
    installed.length === 0
      ? "No harness CLIs were found on PATH."
      : `Found ${installed.length} harness CLI on PATH: ${installed.join(", ")}.`;
  return `${found} Install at least two agent harnesses (for example claude, codex, or opencode) and ensure their binaries are on PATH, then retry \`ai-devkit init --demo\`.`;
}

function leadPrompt(workerName: string): string {
  return `You are the lead agent. Coordinate with "${workerName}" and ask them to reply with exactly: ${DEMO_TOKEN}.`;
}

function extractAssistantReply(result: InitDemoSendResult | void): string | null {
  if (!result || !Array.isArray(result.messages)) return null;
  const assistants = result.messages.filter((message) => message.role === "assistant");
  const last = assistants.at(-1);
  return typeof last?.content === "string" && last.content.trim().length > 0
    ? last.content.trim()
    : null;
}

function toStartedDemoAgent(entry: Awaited<ReturnType<typeof startAgent>>): StartedDemoAgent {
  const tmuxRef = parseTmuxRuntimeRef(entry.runtimeRef);
  return {
    name: entry.name,
    type: entry.type as StartableAgentType,
    pid: entry.pid,
    attach: tmuxRef ? `tmux attach -t ${tmuxRef.session}` : undefined,
  };
}

function renderDemoSummary(
  sink: InitDemoUi,
  input: {
    lead: StartedDemoAgent;
    worker: StartedDemoAgent;
    question: string;
    reply: string | null;
  },
): void {
  sink.breakline();
  sink.success("Demo complete — both agents are still running.");
  sink.text(`  Lead:   ${input.lead.name} (${input.lead.type}, PID ${input.lead.pid})`);
  sink.text(`  Worker: ${input.worker.name} (${input.worker.type}, PID ${input.worker.pid})`);
  if (input.lead.attach) sink.text(`  Attach lead:   ${input.lead.attach}`);
  if (input.worker.attach) sink.text(`  Attach worker: ${input.worker.attach}`);
  sink.breakline();
  sink.text("Handoff:");
  sink.text(`  ${input.lead.name} asked: "${input.question}"`);
  sink.text(
    `  ${input.worker.name} replied: ${input.reply ? `"${input.reply}"` : "(no assistant message captured)"}`,
  );
  sink.breakline();
  sink.text("Try next:");
  sink.text("  ai-devkit agent list");
  sink.text("  ai-devkit agent console");
  sink.text("  ai-devkit status");
}

export async function runInitDemo(
  options: { cwd: string },
  partialDeps: Partial<InitDemoDeps> = {},
): Promise<number> {
  const deps: InitDemoDeps = {
    platform: process.platform,
    commandExists: commandExistsOnPath,
    resolveTmuxInstall: () => resolveTmuxInstallInstructions(createTmuxInspectionDeps()),
    getRuntimeProvider: () => new ConfigManager().getAgentRuntimeProvider(),
    startAgent,
    sendToAgent,
    createManager: createAgentManager,
    createFocusManager: () => new TerminalFocusManager(),
    ui: defaultUi,
    ...partialDeps,
  };

  if (deps.platform === "win32") {
    deps.ui.error(
      "The init --demo multi-agent walkthrough is supported on macOS and Linux only. Use WSL on Windows or run the demo on a supported platform.",
    );
    return 1;
  }

  if (!deps.commandExists("tmux")) {
    const instructions = await deps.resolveTmuxInstall();
    deps.ui.error(`tmux is not installed or not in PATH. ${instructions.message}`);
    return 1;
  }

  const installed = listInstalledHarnessTypes(deps.commandExists);
  const pair = pickDemoHarnessPair(installed);
  if (!pair) {
    deps.ui.error(formatInsufficientHarnessesMessage(installed));
    return 1;
  }

  const runtimeProvider = await deps.getRuntimeProvider();
  const cwd = options.cwd;

  deps.ui.text("Starting first-run agent demo...", { breakline: true });
  deps.ui.info(`Using harnesses: lead=${pair.lead}, worker=${pair.worker}`);

  let workerStarted: StartedDemoAgent;
  let leadStarted: StartedDemoAgent;

  try {
    const workerEntry = await deps.startAgent(
      {
        type: pair.worker,
        name: DEMO_WORKER_NAME,
        cwd,
        runtimeProvider,
      },
      { onWarning: (message) => deps.ui.warning(message) },
    );
    workerStarted = toStartedDemoAgent(workerEntry);

    const leadEntry = await deps.startAgent(
      {
        type: pair.lead,
        name: DEMO_LEAD_NAME,
        cwd,
        runtimeProvider,
      },
      { onWarning: (message) => deps.ui.warning(message) },
    );
    leadStarted = toStartedDemoAgent(leadEntry);
  } catch (error) {
    deps.ui.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const manager = deps.createManager();
  const focusManager = deps.createFocusManager();
  const reporter = {
    info: (message: string) => deps.ui.info(message),
    warning: (message: string) => deps.ui.warning(message),
    success: (message: string) => deps.ui.success(message),
    error: (message: string) => deps.ui.error(message),
  };

  const question = DEMO_WORKER_PROMPT;
  try {
    await deps.sendToAgent({
      id: DEMO_LEAD_NAME,
      prompt: leadPrompt(DEMO_WORKER_NAME),
      manager,
      focusManager,
      wait: false,
      reporter,
    });

    const waitResult = (await deps.sendToAgent({
      id: DEMO_WORKER_NAME,
      prompt: DEMO_WORKER_PROMPT,
      manager,
      focusManager,
      wait: true,
      timeout: "120000",
      reporter,
    })) as InitDemoSendResult | void;

    renderDemoSummary(deps.ui, {
      lead: leadStarted,
      worker: workerStarted,
      question,
      reply: extractAssistantReply(waitResult),
    });
    return 0;
  } catch (error) {
    deps.ui.error(error instanceof Error ? error.message : String(error));
    deps.ui.info(
      `Agents may still be running as "${DEMO_LEAD_NAME}" and "${DEMO_WORKER_NAME}". Run \`ai-devkit agent list\` to inspect.`,
    );
    return 1;
  }
}
