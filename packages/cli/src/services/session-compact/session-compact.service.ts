import type { ConversationMessage } from "@ai-devkit/agent-manager";
import type { ClassifiedSessionEvent, SessionCompact } from "./session-compact.types.js";

export interface SessionEventClassifier {
  readonly model: string;
  classify(message: ConversationMessage): Promise<ClassifiedSessionEvent>;
}

const SESSION_COMPACT_CONCURRENCY = 8;

const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_PATTERN = /(Authorization\s*:\s*Bearer\s+)[^\s]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY))\s*=\s*([^\s]+)/g;

function redactSensitiveText(content: string): string {
  return content
    .replace(PRIVATE_KEY_PATTERN, "[REDACTED]")
    .replace(BEARER_PATTERN, "$1[REDACTED]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[REDACTED]");
}

function includeEvent(event: ClassifiedSessionEvent): boolean {
  return (
    event.keep &&
    !event.sensitive &&
    event.category !== "discard" &&
    event.importance !== "irrelevant"
  );
}

function list(
  events: ClassifiedSessionEvent[],
  category: ClassifiedSessionEvent["category"],
): string[] {
  return events.filter((event) => event.category === category).map((event) => event.content);
}

function buildResumePrompt(intent: string, currentState: string, nextStep: string): string {
  const lines = ["Continue the session from the compacted state above."];
  if (intent) lines.push(`Intent: ${intent}`);
  if (currentState) lines.push(`Current state: ${currentState}`);
  if (nextStep) lines.push(`Next step: ${nextStep}`);
  return lines.join("\n");
}

export async function compactSession(
  messages: ConversationMessage[],
  classifier: SessionEventClassifier,
): Promise<SessionCompact> {
  const classified: ClassifiedSessionEvent[] = [];
  let nextIndex = 0;
  const classifyNext = async (): Promise<void> => {
    while (nextIndex < messages.length) {
      const index = nextIndex;
      nextIndex += 1;
      const message = messages[index];
      classified[index] = await classifier.classify({
        ...message,
        content: redactSensitiveText(message.content),
      });
    }
  };
  const workerCount = Math.min(SESSION_COMPACT_CONCURRENCY, messages.length);
  await Promise.all(Array.from({ length: workerCount }, () => classifyNext()));

  const retained = classified.filter(includeEvent);
  const intent = list(retained, "user_instruction")[0] ?? "";
  const decisions = list(retained, "decision");
  const changedFiles = list(retained, "code_change");
  const commands = list(retained, "command_evidence");
  const validation = list(retained, "validation_evidence");
  const openQuestions = list(retained, "blocker");
  const nextSteps = list(retained, "next_step");
  const nextStep = nextSteps.at(-1) ?? "";
  const memoryCandidates = list(retained, "memory_candidate");
  const currentState = retained
    .filter((event) =>
      ["decision", "code_change", "validation_evidence", "blocker"].includes(event.category),
    )
    .map((event) => event.content)
    .join("\n");

  return {
    intent,
    currentState,
    decisions,
    changedFiles,
    commands,
    validation,
    openQuestions,
    nextStep,
    memoryCandidates,
    resumePrompt: buildResumePrompt(intent, currentState, nextStep),
    jev: { available: true, model: classifier.model, classifiedEvents: classified.length },
  };
}

function markdownValue(value: string): string {
  return value || "_None recorded._";
}

function markdownList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "_None recorded._";
}

export function renderSessionCompactMarkdown(compact: SessionCompact): string {
  return `# Session Compact

## User Intent

${markdownValue(compact.intent)}

## Current State

${markdownValue(compact.currentState)}

## Decisions Made

${markdownList(compact.decisions)}

## Files Touched

${markdownList(compact.changedFiles)}

## Commands Run

${markdownList(compact.commands)}

## Validation Evidence

${markdownList(compact.validation)}

## Open Questions

${markdownList(compact.openQuestions)}

## Next Step

${markdownValue(compact.nextStep)}

## Memory Candidates

${markdownList(compact.memoryCandidates)}

## Resume Prompt

${compact.resumePrompt}
`;
}
