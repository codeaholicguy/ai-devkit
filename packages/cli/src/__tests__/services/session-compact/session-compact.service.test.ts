import type { ConversationMessage } from "@ai-devkit/agent-manager";
import {
  compactSession,
  renderSessionCompactMarkdown,
  type SessionEventClassifier,
} from "../../../services/session-compact/session-compact.service.js";
import type {
  ClassifiedSessionEvent,
  CompactCategory,
} from "../../../services/session-compact/session-compact.types.js";

function event(
  category: CompactCategory,
  content: string,
  overrides: Partial<ClassifiedSessionEvent> = {},
): ClassifiedSessionEvent {
  return {
    role: "assistant",
    content,
    keep: true,
    category,
    importance: "important",
    sensitive: false,
    ...overrides,
  };
}

function classifier(events: ClassifiedSessionEvent[]): SessionEventClassifier {
  let index = 0;
  return {
    model: "jev-test",
    classify: vi.fn(async () => events[index++]),
  };
}

describe("session compaction", () => {
  it("returns an empty but valid compact for an empty conversation", async () => {
    const result = await compactSession([], classifier([]));

    expect(result).toEqual({
      intent: "",
      currentState: "",
      decisions: [],
      changedFiles: [],
      commands: [],
      validation: [],
      openQuestions: [],
      nextStep: "",
      memoryCandidates: [],
      resumePrompt: "Continue the session from the compacted state above.",
      jev: { available: true, model: "jev-test", classifiedEvents: 0 },
    });
  });

  it("groups retained events and builds a deterministic continuation artifact", async () => {
    const messages: ConversationMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: index === 0 ? "user" : "assistant",
      content: `message-${index}`,
    }));
    const result = await compactSession(
      messages,
      classifier([
        event("user_instruction", "Keep the CLI explicit", { role: "user" }),
        event("decision", "Use the existing namespace"),
        event("code_change", "Changed packages/cli/src/commands/agent.ts"),
        event("command_evidence", "npm run build"),
        event("validation_evidence", "CLI tests passed"),
        event("blocker", "Live key is unavailable"),
        event("next_step", "Add the built-in skill"),
        event("memory_candidate", "Adapters own transcript parsing"),
      ]),
    );

    expect(result.intent).toBe("Keep the CLI explicit");
    expect(result.decisions).toEqual(["Use the existing namespace"]);
    expect(result.changedFiles).toEqual(["Changed packages/cli/src/commands/agent.ts"]);
    expect(result.commands).toEqual(["npm run build"]);
    expect(result.validation).toEqual(["CLI tests passed"]);
    expect(result.openQuestions).toEqual(["Live key is unavailable"]);
    expect(result.nextStep).toBe("Add the built-in skill");
    expect(result.memoryCandidates).toEqual(["Adapters own transcript parsing"]);
    expect(result.currentState).toContain("Changed packages/cli/src/commands/agent.ts");
    expect(result.resumePrompt).toContain("Intent: Keep the CLI explicit");
    expect(result.resumePrompt).toContain("Next step: Add the built-in skill");
    expect(result.jev.classifiedEvents).toBe(8);
  });

  it("excludes events that are discarded, irrelevant, sensitive, or not retained", async () => {
    const messages: ConversationMessage[] = Array.from({ length: 4 }, () => ({
      role: "assistant",
      content: "source",
    }));
    const result = await compactSession(
      messages,
      classifier([
        event("decision", "not retained", { keep: false }),
        event("discard", "discarded"),
        event("decision", "irrelevant", { importance: "irrelevant" }),
        event("decision", "secret", { sensitive: true }),
      ]),
    );

    expect(result.decisions).toEqual([]);
    expect(result.currentState).toBe("");
  });

  it("classifies eight messages concurrently while preserving source order", async () => {
    const messages: ConversationMessage[] = Array.from({ length: 10 }, (_, index) => ({
      role: "assistant",
      content: `message-${index}`,
    }));
    let active = 0;
    let maxActive = 0;
    const boundedClassifier: SessionEventClassifier = {
      model: "jev-test",
      classify: vi.fn(async (message) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const index = Number(message.content.split("-").at(-1));
        await new Promise((resolve) => setTimeout(resolve, (10 - index) * 2));
        active -= 1;
        return event("decision", message.content);
      }),
    };

    const result = await compactSession(messages, boundedClassifier);

    expect(maxActive).toBe(8);
    expect(result.decisions).toEqual(messages.map((message) => message.content));
  });

  it("redacts common credentials before classification", async () => {
    const content = [
      "Authorization: Bearer abc.def.ghi",
      "TYPESAFE_API_KEY=jv_live_example",
      "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----",
    ].join("\n");
    const classify = vi.fn(async (message: ConversationMessage) =>
      event("decision", message.content),
    );

    await compactSession([{ role: "assistant", content }], { model: "jev-test", classify });

    const classifiedContent = classify.mock.calls[0][0].content;
    expect(classifiedContent).not.toContain("abc.def.ghi");
    expect(classifiedContent).not.toContain("jv_live_example");
    expect(classifiedContent).not.toContain("private-material");
    expect(classifiedContent.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("renders all required Markdown sections", async () => {
    const compact = await compactSession([], classifier([]));

    expect(renderSessionCompactMarkdown(compact)).toBe(`# Session Compact

## User Intent

_None recorded._

## Current State

_None recorded._

## Decisions Made

_None recorded._

## Files Touched

_None recorded._

## Commands Run

_None recorded._

## Validation Evidence

_None recorded._

## Open Questions

_None recorded._

## Next Step

_None recorded._

## Memory Candidates

_None recorded._

## Resume Prompt

Continue the session from the compacted state above.
`);
  });
});
