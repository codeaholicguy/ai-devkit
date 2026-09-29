import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MATCH_TOLERANCE_MS as reExported } from "../../utils/matching.js";
import { MATCH_TOLERANCE_MS } from "../../utils/matchingConstants.js";

const SRC_DIR = fileURLToPath(new URL("../../", import.meta.url));
const CONSTANTS_FILE = path.join(SRC_DIR, "utils", "matchingConstants.ts");
/** `3 * 60 * 1000`, `180000`, `180_000`, or `3 * 60_000` written in source. */
const TOLERANCE_LITERAL = /\b3\s*\*\s*60\s*\*\s*1_?000\b|\b180_?000\b|\b3\s*\*\s*60_?000\b/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") files.push(...listSourceFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("MATCH_TOLERANCE_MS", () => {
  it("is 3 minutes and re-exported unchanged from utils/matching", () => {
    expect(MATCH_TOLERANCE_MS).toBe(3 * 60 * 1000);
    expect(reExported).toBe(MATCH_TOLERANCE_MS);
  });

  it("is not duplicated as a literal elsewhere in agent-manager source", () => {
    const offenders = listSourceFiles(SRC_DIR)
      .filter((file) => file !== CONSTANTS_FILE)
      .filter((file) => TOLERANCE_LITERAL.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC_DIR, file));

    expect(offenders).toEqual([]);
  });
});
