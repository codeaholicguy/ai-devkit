/**
 * Regression coverage for https://github.com/codeaholicguy/ai-devkit/issues/402
 *
 * Nested/sandboxed `agent start` with a divergent HOME must not report success
 * with an assigned name that only exists in an invisible registry. The local
 * fallback refuses when the real account already has an identity store.
 */
import { join } from "path";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startAgent, AgentHomeDivergenceError } = await import("@ai-devkit/agent-manager");

describe("agent start HOME divergence (e2e shape)", () => {
  it("refuses local start when account store exists under divergent HOME", async () => {
    const accountHome = mkdtempSync(join(tmpdir(), "e2e-account-home-"));
    mkdirSync(join(accountHome, ".ai-devkit"), { recursive: true });

    const tmux = {
      isAvailable: async () => true,
      sessionExists: async () => false,
      createSession: async () => undefined,
      sendKeys: async () => undefined,
      killSession: async () => undefined,
      findAgentPid: async () => 42,
    };

    await expect(
      startAgent(
        { type: "claude", name: "tests", cwd: process.cwd() },
        {
          tmux: tmux as never,
          checkHomeScope: () => ({ envHome: "/tmp/fakehome", accountHome }),
        },
      ),
    ).rejects.toBeInstanceOf(AgentHomeDivergenceError);

    rmSync(accountHome, { recursive: true, force: true });
  });
});