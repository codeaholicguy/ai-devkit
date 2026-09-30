import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HARNESS_RUNTIME_PROFILES,
  runtimeAgentMatchesHarness,
} from "../../harnesses/runtimeProfiles.js";

describe("harness runtime profiles", () => {
  it("keeps launch and runtime identity metadata together", () => {
    expect(HARNESS_RUNTIME_PROFILES.antigravity_cli).toMatchObject({
      command: "agy",
      runtimeKind: "agy",
      discoveryAliases: ["agy", "antigravity", "antigravity_cli"],
    });
    expect(HARNESS_RUNTIME_PROFILES.antigravity_cli.matches("/usr/local/bin/agy")).toBe(true);
  });

  it("recognizes agent commands without matching similar argument text", () => {
    expect(HARNESS_RUNTIME_PROFILES.copilot.matches("/opt/copilot-cli/1.0/copilot")).toBe(true);
    expect(HARNESS_RUNTIME_PROFILES.copilot.matches("node /repo/copilot-cli/script.js")).toBe(
      false,
    );
    expect(HARNESS_RUNTIME_PROFILES.grok_cli.matches("/Users/dev/.grok/bin/grok --approve")).toBe(
      true,
    );
    expect(HARNESS_RUNTIME_PROFILES.grok_cli.matches("node /repo/grok-cli/script.js")).toBe(false);
    expect(
      HARNESS_RUNTIME_PROFILES.gemini_cli.matches("node --no-warnings /usr/local/bin/gemini"),
    ).toBe(true);
  });

  it("matches runtime discovery names through the owning harness profile", () => {
    expect(runtimeAgentMatchesHarness("kiro-cli", "kiro")).toBe(true);
    expect(runtimeAgentMatchesHarness("gemini", "gemini_cli")).toBe(true);
    expect(runtimeAgentMatchesHarness("codex", "claude")).toBe(false);
  });
});

describe("harness matchers with executables under paths containing spaces", () => {
  let root: string;

  function install(relativePath: string): string {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "");
    return fullPath;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-profiles-spaces-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("recognizes argv[0] under a spaced directory", () => {
    const codex = install("Applications/Some App.app/Contents/Resources/codex");
    const claude = install("Users/dev/My Tools/bin/claude");

    expect(HARNESS_RUNTIME_PROFILES.codex.matches(`${codex} --sandbox workspace-write`)).toBe(true);
    expect(HARNESS_RUNTIME_PROFILES.codex.matches(codex)).toBe(true);
    expect(HARNESS_RUNTIME_PROFILES.claude.matches(`${claude} --continue`)).toBe(true);
    expect(HARNESS_RUNTIME_PROFILES.claude.matches(`${codex} exec --cd /repo`)).toBe(false);
  });

  it("recognizes argv[0] by distribution name under a spaced directory", () => {
    const copilot = install("opt/Home Brew/Caskroom/copilot-cli/1.0.60/copilot");

    expect(HARNESS_RUNTIME_PROFILES.copilot.matches(`${copilot} --allow-all-tools`)).toBe(true);
  });

  it("does not treat arguments containing spaces as the executable", () => {
    const vim = install("usr/bin/vim");
    const codex = install("Applications/Some App.app/Contents/Resources/codex");

    expect(HARNESS_RUNTIME_PROFILES.claude.matches(`${vim} My Notes/claude`)).toBe(false);
    expect(
      HARNESS_RUNTIME_PROFILES.claude.matches(`${codex} exec review the Other Dir/claude`),
    ).toBe(false);
    expect(HARNESS_RUNTIME_PROFILES.copilot.matches(`${vim} Some Dir/copilot-cli/notes.md`)).toBe(
      false,
    );
    expect(HARNESS_RUNTIME_PROFILES.claude.matches("/usr/bin/vim My Notes/claude")).toBe(false);
  });

  it("recognizes spaced argv[0] in script-aware matchers", () => {
    const pi = install("Users/dev/Node Tools/bin/pi");
    const kiro = install("Applications/Kiro CLI.app/Contents/MacOS/kiro-cli");
    const node = install("Applications/Dev Tools/node/bin/node");

    expect(HARNESS_RUNTIME_PROFILES.pi.matches(`${pi} --model x`)).toBe(true);
    expect(HARNESS_RUNTIME_PROFILES.kiro.matches(`${kiro} chat`)).toBe(true);
    expect(
      HARNESS_RUNTIME_PROFILES.gemini_cli.matches(`${node} /Users/dev/.npm/bin/gemini --yolo`),
    ).toBe(true);
    expect(HARNESS_RUNTIME_PROFILES.pi.matches(`${node} /opt/pi-tools/script.js`)).toBe(false);
  });

  it("does not match agent words inside an executable directory", () => {
    const node = install("opt/Dev pi gemini/bin/node");

    expect(HARNESS_RUNTIME_PROFILES.pi.matches(`${node} /repo/script.js`)).toBe(false);
    expect(HARNESS_RUNTIME_PROFILES.gemini_cli.matches(`${node} /repo/script.js`)).toBe(false);
    expect(HARNESS_RUNTIME_PROFILES.gemini_cli.matches(`${node} /repo/bin/gemini`)).toBe(true);
    expect(HARNESS_RUNTIME_PROFILES.pi.matches(`${node} --title pi`)).toBe(true);
  });
});
