export type Phase =
  | "requirements"
  | "design"
  | "planning"
  | "implementation"
  | "testing"
  | "deployment"
  | "monitoring";

export type Environment = "cursor" | "claude" | "copilot" | "all";

export interface DevKitConfig {
  version: string;
  environment?: Environment;
  initializedPhases: Phase[];
  createdAt: string;
  updatedAt: string;
}

export interface PhaseMetadata {
  phase: string;
  title: string;
  description: string;
}

export const AVAILABLE_PHASES: Phase[] = [
  "requirements",
  "design",
  "planning",
  "implementation",
  "testing",
  "deployment",
  "monitoring",
];

export const PHASE_DISPLAY_NAMES: Record<Phase, string> = {
  requirements: "Requirements & Problem Understanding",
  design: "System Design & Architecture",
  planning: "Project Planning & Task Breakdown",
  implementation: "Implementation Guide",
  testing: "Testing Strategy",
  deployment: "Deployment Strategy",
  monitoring: "Monitoring & Observability",
};
