/**
 * Readiness fixture replay: each committed bundle under
 * `fixtures/readiness/` provides the injectable seams (files,
 * executables, command outputs, codexAuth) plus `expected` — the
 * byte-identical reports the readiness probes must produce replaying
 * the same bundle through their injectable seams.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getAgentReadinessReports,
  type AgentReadinessOptions,
} from "../harnesses/readiness/AgentReadiness.js";

interface ReadinessBundle {
  options: {
    homeDir: string;
    path: string;
    assetRoot?: string;
    builtInSkillNames?: string[];
    skillRoots?: Record<string, string>;
  };
  /** Absolute path → contents, or "<dir>" for a directory entry. */
  files: Record<string, string>;
  /** Paths that answer X_OK access. */
  executables: string[];
  /** `"command arg1 arg2"` → output; `ok: false` rejects like execFile. */
  commands: Record<string, { stdout: string; stderr?: string; ok?: boolean }>;
  codexAuth?: boolean | null;
  expected: Record<string, unknown>;
}

const READINESS_ROOT = path.resolve(__dirname, "../../../..", "fixtures", "readiness");

const bundlePaths = fs.existsSync(READINESS_ROOT)
  ? fs
      .readdirSync(READINESS_ROOT)
      .filter((f) => f.endsWith(".json") && !f.startsWith("live"))
      .sort()
      .map((f) => path.join(READINESS_ROOT, f))
  : [];

function replay(bundle: ReadinessBundle): Promise<Record<string, unknown>> {
  const executableSet = new Set(bundle.executables);
  const options: AgentReadinessOptions = {
    homeDir: bundle.options.homeDir,
    path: bundle.options.path,
    assetRoot: bundle.options.assetRoot,
    builtInSkillNames: bundle.options.builtInSkillNames ?? [],
    skillRoots: bundle.options.skillRoots ?? {},
    readFile: async (target) => {
      if (!(target in bundle.files)) throw new Error("missing");
      return bundle.files[target];
    },
    access: async (target) => {
      if (executableSet.has(target) || target in bundle.files) return;
      throw new Error("missing");
    },
    runCommand: async (command, args) => {
      const key = [command, ...args].join(" ");
      const stub = bundle.commands[key];
      if (!stub) throw new Error(`unexpected command ${key}`);
      if (stub.ok === false) throw new Error(`command failed: ${key}`);
      return { stdout: stub.stdout, stderr: stub.stderr ?? "" };
    },
    codexAuth: async () => bundle.codexAuth ?? null,
  };
  return getAgentReadinessReports(options);
}

describe("readiness fixture replay", () => {
  it.each(bundlePaths)("%s", async (bundlePath) => {
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8")) as ReadinessBundle;
    const reports = await replay(bundle);
    expect(reports).toEqual(bundle.expected);
  });
});
