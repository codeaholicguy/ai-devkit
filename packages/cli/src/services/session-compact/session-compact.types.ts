import type { ConversationMessage } from "@ai-devkit/agent-manager";

export const COMPACT_CATEGORIES = [
  "user_instruction",
  "decision",
  "code_change",
  "command_evidence",
  "validation_evidence",
  "blocker",
  "next_step",
  "memory_candidate",
  "discard",
] as const;

export type CompactCategory = (typeof COMPACT_CATEGORIES)[number];

export const COMPACT_IMPORTANCE = ["irrelevant", "useful", "important", "critical"] as const;

export type CompactImportance = (typeof COMPACT_IMPORTANCE)[number];

export interface ClassifiedSessionEvent extends ConversationMessage {
  keep: boolean;
  category: CompactCategory;
  importance: CompactImportance;
  sensitive: boolean;
}

export interface SessionCompact {
  intent: string;
  currentState: string;
  decisions: string[];
  changedFiles: string[];
  commands: string[];
  validation: string[];
  openQuestions: string[];
  nextStep: string;
  memoryCandidates: string[];
  resumePrompt: string;
  jev: {
    available: true;
    model: string;
    classifiedEvents: number;
  };
}

export interface JevUnavailableResult {
  jev: {
    available: false;
    reason: "TYPESAFE_API_KEY is not set";
  };
}

export type SessionCompactResult = SessionCompact | JevUnavailableResult;

export const JEV_UNAVAILABLE_REASON = "TYPESAFE_API_KEY is not set" as const;
export const JEV_UNAVAILABLE_MESSAGE = `Jev is unavailable because ${JEV_UNAVAILABLE_REASON}.`;
