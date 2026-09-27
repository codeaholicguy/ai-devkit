import chalk from "chalk";
import { DEFAULT_PHASES } from "../../types.js";

export const LIFECYCLE_PHASES = DEFAULT_PHASES;
export const FEATURE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const LINT_LEVEL = {
  OK: "ok",
  MISS: "miss",
  WARN: "warn",
} as const;

export const LINT_STATUS_LABEL = {
  [LINT_LEVEL.OK]: chalk.green("✓"),
  [LINT_LEVEL.MISS]: chalk.red("✖"),
  [LINT_LEVEL.WARN]: chalk.yellow("⚠"),
} as const;
