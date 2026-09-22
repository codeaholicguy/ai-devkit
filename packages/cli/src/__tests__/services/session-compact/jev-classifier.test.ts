import type { ConversationMessage } from "@ai-devkit/agent-manager";
import {
  createJevSessionEventClassifier,
  JevSessionEventClassifier,
} from "../../../services/session-compact/jev-classifier.js";

function choiceAnswer(choice: string) {
  return { type: "choice" as const, choice, confidence: 0.9, probabilities: {} };
}

describe("JevSessionEventClassifier", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses jev-latest when the optional model environment value is blank", () => {
    vi.stubEnv("TYPESAFE_DEFAULT_MODEL", "   ");

    expect(createJevSessionEventClassifier("test-key").model).toBe("jev-latest");
  });

  it("asks typed questions and maps the answers into a classified event", async () => {
    const systemOne = vi.fn().mockResolvedValue({
      model: "jev-1.13.0",
      usage: { input_tokens: 10, output_tokens: 0 },
      answers: {
        category: choiceAnswer("code_change"),
        importance: choiceAnswer("critical"),
        keep: { type: "noul", noul: 0.8 },
        sensitive: { type: "noul", noul: 0.1 },
      },
    });
    const classifier = new JevSessionEventClassifier({ systemOne }, "jev-latest");
    const message: ConversationMessage = {
      role: "assistant",
      content: "Authorization: Bearer secret-token\nChanged agent.ts",
      timestamp: "2026-09-22T00:00:00.000Z",
    };

    const result = await classifier.classify(message);

    expect(result).toEqual({
      role: "assistant",
      content: "Authorization: Bearer [REDACTED]\nChanged agent.ts",
      timestamp: "2026-09-22T00:00:00.000Z",
      category: "code_change",
      importance: "critical",
      keep: true,
      sensitive: false,
    });
    expect(systemOne).toHaveBeenCalledOnce();
    const request = systemOne.mock.calls[0][0];
    expect(request.model).toBe("jev-latest");
    expect(request.state).toEqual({
      role: "assistant",
      content: "Authorization: Bearer [REDACTED]\nChanged agent.ts",
      timestamp: "2026-09-22T00:00:00.000Z",
    });
    expect(Object.keys(request.questions)).toEqual(["category", "importance", "keep", "sensitive"]);
    expect(request.questions.category.type).toBe("choice");
    expect(request.questions.importance.type).toBe("choice");
    expect(request.questions.keep.type).toBe("noul");
    expect(request.questions.sensitive.type).toBe("noul");
    expect(JSON.stringify(request)).not.toContain("secret-token");
  });

  it.each([
    ["category", "unexpected", "Unexpected Jev category: unexpected"],
    ["importance", "urgent", "Unexpected Jev importance: urgent"],
  ])("rejects an unknown %s label", async (field, value, expectedMessage) => {
    const answers = {
      category: choiceAnswer(field === "category" ? value : "decision"),
      importance: choiceAnswer(field === "importance" ? value : "important"),
      keep: { type: "noul" as const, noul: 0.9 },
      sensitive: { type: "noul" as const, noul: 0.1 },
    };
    const classifier = new JevSessionEventClassifier(
      { systemOne: vi.fn().mockResolvedValue({ model: "jev-latest", usage: {}, answers }) },
      "jev-latest",
    );

    await expect(classifier.classify({ role: "assistant", content: "content" })).rejects.toThrow(
      expectedMessage,
    );
  });

  it.each([
    ["keep", Number.NaN],
    ["sensitive", 1.2],
  ])("rejects an invalid %s noul probability", async (field, value) => {
    const answers = {
      category: choiceAnswer("decision"),
      importance: choiceAnswer("important"),
      keep: { type: "noul" as const, noul: field === "keep" ? value : 0.9 },
      sensitive: { type: "noul" as const, noul: field === "sensitive" ? value : 0.1 },
    };
    const classifier = new JevSessionEventClassifier(
      { systemOne: vi.fn().mockResolvedValue({ model: "jev-latest", usage: {}, answers }) },
      "jev-latest",
    );

    await expect(classifier.classify({ role: "assistant", content: "content" })).rejects.toThrow(
      `Unexpected Jev ${field} probability`,
    );
  });
});
