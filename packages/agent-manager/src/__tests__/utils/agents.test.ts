import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENTS } from "../../utils/agents.js";

describe("AGENTS", () => {
  it("includes Copilot as a startable agent", () => {
    expect(AGENTS.copilot.command).toBe("copilot");
    expect(AGENTS.copilot.matches("/opt/homebrew/Caskroom/copilot-cli/1.0.60/copilot")).toBe(true);
    expect(AGENTS.copilot.matches("node /repo/feature-cli-copilot-cli/script.js")).toBe(false);
  });

  it("includes Pi as a startable agent", () => {
    expect(AGENTS.pi.command).toBe("pi");
    expect(AGENTS.pi.matches("pi")).toBe(true);
    expect(AGENTS.pi.matches("/usr/local/bin/pi --model x")).toBe(true);
    expect(AGENTS.pi.matches("node /repo/feature-pi-adapter/script.js")).toBe(false);
  });

  it("includes Grok as a startable agent", () => {
    expect(AGENTS.grok_cli.command).toBe("grok");
    expect(AGENTS.grok_cli.matches("grok")).toBe(true);
    expect(AGENTS.grok_cli.matches("/Users/dev/.grok/bin/grok --always-approve")).toBe(true);
    expect(AGENTS.grok_cli.matches("node /repo/feature-grok-cli/script.js")).toBe(false);
  });

  it("includes Kiro as a startable agent", () => {
    expect(AGENTS.kiro.command).toBe("kiro-cli");
    expect(AGENTS.kiro.matches("kiro-cli")).toBe(true);
    expect(AGENTS.kiro.matches("/usr/local/bin/kiro --model x")).toBe(true);
    expect(AGENTS.kiro.matches("node /repo/feature-kiro-adapter/script.js")).toBe(false);
  });

  it("matches Gemini as argv[0] or as a script argument", () => {
    expect(AGENTS.gemini_cli.matches("gemini --yolo")).toBe(true);
    expect(AGENTS.gemini_cli.matches("node --no-warnings /usr/local/bin/gemini")).toBe(true);
    expect(AGENTS.gemini_cli.matches("node /repo/gemini-tools/script.js")).toBe(false);
  });
});

describe("AGENTS matchers with executables under paths containing spaces", () => {
  let root: string;

  function install(relativePath: string): string {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "");
    return fullPath;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-spaces-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("recognises argv[0] under a spaced directory (matchArgv0)", () => {
    const codex = install("Applications/Some App.app/Contents/Resources/codex");
    const claude = install("Users/dev/My Tools/bin/claude");

    expect(AGENTS.codex.matches(`${codex} --sandbox workspace-write`)).toBe(true);
    expect(AGENTS.codex.matches(codex)).toBe(true);
    expect(AGENTS.claude.matches(`${claude} --continue`)).toBe(true);
    expect(AGENTS.claude.matches(`${codex} exec --cd /repo`)).toBe(false);
  });

  it("recognises argv[0] under a spaced directory by name (matchArgv0Name)", () => {
    const copilot = install("opt/Home Brew/Caskroom/copilot-cli/1.0.60/copilot");

    expect(AGENTS.copilot.matches(`${copilot} --allow-all-tools`)).toBe(true);
  });

  it("does not treat arguments containing spaces as the executable", () => {
    const vim = install("usr/bin/vim");
    const codex = install("Applications/Some App.app/Contents/Resources/codex");

    expect(AGENTS.claude.matches(`${vim} My Notes/claude`)).toBe(false);
    expect(AGENTS.claude.matches(`${codex} exec review the Other Dir/claude`)).toBe(false);
    expect(AGENTS.copilot.matches(`${vim} Some Dir/copilot-cli/notes.md`)).toBe(false);
    expect(AGENTS.claude.matches("/usr/bin/vim My Notes/claude")).toBe(false);
  });

  it("recognises a spaced argv[0] in the any-token matchers", () => {
    const pi = install("Users/dev/Node Tools/bin/pi");
    const kiro = install("Applications/Kiro CLI.app/Contents/MacOS/kiro-cli");
    const node = install("Applications/Dev Tools/node/bin/node");

    expect(AGENTS.pi.matches(`${pi} --model x`)).toBe(true);
    expect(AGENTS.kiro.matches(`${kiro} chat`)).toBe(true);
    expect(AGENTS.gemini_cli.matches(`${node} /Users/dev/.npm/bin/gemini --yolo`)).toBe(true);
    expect(AGENTS.pi.matches(`${node} /opt/pi-tools/script.js`)).toBe(false);
  });

  it("does not match words inside a spaced argv[0] directory in the any-token matchers", () => {
    const node = install("opt/Dev pi gemini/bin/node");

    expect(AGENTS.pi.matches(`${node} /repo/script.js`)).toBe(false);
    expect(AGENTS.gemini_cli.matches(`${node} /repo/script.js`)).toBe(false);
    expect(AGENTS.gemini_cli.matches(`${node} /repo/bin/gemini`)).toBe(true);
    expect(AGENTS.pi.matches(`${node} --title pi`)).toBe(true);
  });
});
