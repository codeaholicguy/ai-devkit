import type { ConversationMessage } from "@ai-devkit/agent-manager";
import { choice, noul, TypeSafeClient, type SystemOneResult } from "@typesafe-ai/sdk";
import type { SessionEventClassifier } from "./session-compact.service.js";
import {
  COMPACT_CATEGORIES,
  COMPACT_IMPORTANCE,
  type ClassifiedSessionEvent,
  type CompactCategory,
  type CompactImportance,
} from "./session-compact.types.js";

const categoryCriteria = Object.fromEntries(
  COMPACT_CATEGORIES.map((category) => [category, null]),
) as Record<CompactCategory, null>;

const importanceCriteria = Object.fromEntries(
  COMPACT_IMPORTANCE.map((importance) => [importance, null]),
) as Record<CompactImportance, null>;

const classificationQuestions = {
  category: choice(
    "Which operational category best describes this coding-session event?",
    categoryCriteria,
  ),
  importance: choice(
    "How important is this event for accurately continuing the coding session?",
    importanceCriteria,
  ),
  keep: noul("Should this event survive session compaction?"),
  sensitive: noul("Does this event contain sensitive material that should not be stored?"),
};

interface JevClassificationClient {
  systemOne(request: {
    state: { role: string; content: string; timestamp?: string };
    questions: typeof classificationQuestions;
    model: string;
  }): Promise<SystemOneResult<typeof classificationQuestions>>;
}

function isCategory(value: string): value is CompactCategory {
  return (COMPACT_CATEGORIES as readonly string[]).includes(value);
}

function isImportance(value: string): value is CompactImportance {
  return (COMPACT_IMPORTANCE as readonly string[]).includes(value);
}

function requireProbability(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Unexpected Jev ${name} probability`);
  }
  return value;
}

export class JevSessionEventClassifier implements SessionEventClassifier {
  constructor(
    private readonly client: JevClassificationClient,
    readonly model = "jev-latest",
  ) {}

  async classify(message: ConversationMessage): Promise<ClassifiedSessionEvent> {
    const response = await this.client.systemOne({
      model: this.model,
      state: message,
      questions: classificationQuestions,
    });

    const category = response.answers.category.choice;
    if (!isCategory(category)) throw new Error(`Unexpected Jev category: ${category}`);

    const importance = response.answers.importance.choice;
    if (!isImportance(importance)) throw new Error(`Unexpected Jev importance: ${importance}`);

    const keep = requireProbability("keep", response.answers.keep.noul);
    const sensitive = requireProbability("sensitive", response.answers.sensitive.noul);

    return {
      ...message,
      category,
      importance,
      keep: keep >= 0.5,
      sensitive: sensitive >= 0.5,
    };
  }
}

export function createJevSessionEventClassifier(
  apiKey: string,
  model = process.env.TYPESAFE_DEFAULT_MODEL,
): JevSessionEventClassifier {
  const resolvedModel = model?.trim() || "jev-latest";
  const sdk = new TypeSafeClient({ apiKey, defaultModel: resolvedModel, logLevel: "off" });
  const client: JevClassificationClient = {
    systemOne: async (request) => sdk.systemOne(request),
  };
  return new JevSessionEventClassifier(client, resolvedModel);
}
