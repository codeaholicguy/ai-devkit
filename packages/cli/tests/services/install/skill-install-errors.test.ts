import { CliError, GitError, NotFoundError } from "../../../src/util/errors.js";
import {
  formatUnreachableSkillWarning,
  isUnreachableSkillInstallError,
} from "../../../src/services/install/skill-install-errors.js";

describe("skill install error classification", () => {
  it("treats registry fetch failures as unreachable", () => {
    expect(isUnreachableSkillInstallError(new GitError("Git clone failed"))).toBe(true);
    expect(
      isUnreachableSkillInstallError(new CliError("Failed to fetch registry", "NETWORK_ERROR")),
    ).toBe(true);
    expect(
      isUnreachableSkillInstallError(
        new NotFoundError('Registry "personal/me" not found.', { registryId: "personal/me" }),
      ),
    ).toBe(true);
  });

  it("treats missing skills in a reachable registry as fatal", () => {
    expect(
      isUnreachableSkillInstallError(
        new NotFoundError('Skill "missing" not found in codeaholicguy/ai-devkit.', {
          skillName: "missing",
          registryId: "codeaholicguy/ai-devkit",
        }),
      ),
    ).toBe(false);
  });

  it("formats a single skipped-skill warning", () => {
    expect(formatUnreachableSkillWarning("personal/me", "release-ai-devkit")).toBe(
      "Skill personal/me/release-ai-devkit: could not be fetched (registry may be private or unreachable).",
    );
  });
});
