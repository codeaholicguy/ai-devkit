import { describe, expect, it, vi } from "vitest";
import { CodexPrintError } from "../../../../durable/DurableAgent.js";
import { CodexPrintAgentService } from "../../../../harnesses/codex/durable/CodexPrintAgentService.js";

const SESSION = "22222222-2222-4222-8222-222222222222";
const base = {
  id: "id",
  name: "reviewer",
  provider: "codex",
  providerSessionId: null,
  sessionHealth: "uninitialized",
};

describe("CodexPrintAgentService", () => {
  it("validates before provider-aware create and never runs Codex", async () => {
    const probe = {
      validate: vi.fn().mockResolvedValue({ executable: "codex", version: "0.147.0" }),
    };
    const repository = { create: vi.fn().mockResolvedValue(base) };
    const runner = { run: vi.fn() };
    await new CodexPrintAgentService({ repository, probe, runner }).create({
      name: "reviewer",
      cwd: "/project",
    });
    expect(repository.create).toHaveBeenCalledWith({
      name: "reviewer",
      cwd: "/project",
      provider: "codex",
    });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("binds during first send and explicitly resumes later sends", async () => {
    const repository = {
      resolve: vi.fn().mockResolvedValue(base),
      acquireRun: vi
        .fn()
        .mockResolvedValueOnce({ agent: base, token: "one" })
        .mockResolvedValueOnce({
          agent: { ...base, providerSessionId: SESSION, sessionHealth: "healthy" },
          token: "two",
        }),
      recordProviderProcess: vi.fn(),
      bindProviderSession: vi.fn(),
      completeRun: vi.fn(),
    };
    const runner = {
      run: vi.fn().mockImplementation(async (request) => {
        await request.onSpawn({ pid: 42, startedAt: "start" });
        await request.onSession(SESSION);
        return { sessionId: SESSION, result: "answer", messages: ["answer"], exitCode: 0 };
      }),
    };
    const service = new CodexPrintAgentService({
      repository,
      probe: { validate: vi.fn() },
      runner,
      executable: "fake-codex",
    });

    await service.send("reviewer", "first");
    await service.send("reviewer", "later");

    expect(repository.bindProviderSession).toHaveBeenNthCalledWith(1, "id", "one", SESSION);
    expect(repository.bindProviderSession).toHaveBeenNthCalledWith(2, "id", "two", SESSION);
    expect(repository.completeRun).toHaveBeenCalledWith(
      "id",
      "one",
      expect.objectContaining({
        status: "succeeded",
        sessionHealth: "healthy",
      }),
    );
  });

  it("records mismatch separately from unknown failures", async () => {
    const completeRun = vi.fn();
    const repository = {
      resolve: vi.fn().mockResolvedValue(base),
      acquireRun: vi.fn().mockResolvedValue({ agent: base, token: "one" }),
      recordProviderProcess: vi.fn(),
      bindProviderSession: vi.fn(),
      completeRun,
    };
    const service = new CodexPrintAgentService({
      repository,
      probe: { validate: vi.fn() },
      runner: {
        run: vi.fn().mockRejectedValue(new CodexPrintError("mismatch", "CODEX_SESSION_MISMATCH")),
      },
    });
    await expect(service.send("reviewer", "x")).rejects.toMatchObject({
      code: "CODEX_SESSION_MISMATCH",
    });
    expect(completeRun).toHaveBeenCalledWith(
      "id",
      "one",
      expect.objectContaining({ sessionHealth: "mismatch" }),
    );
  });

  it("rejects a non-Codex target without acquiring or mutating it", async () => {
    const repository = {
      resolve: vi.fn().mockResolvedValue({ ...base, provider: "claude" }),
      acquireRun: vi.fn(),
      recordProviderProcess: vi.fn(),
      bindProviderSession: vi.fn(),
      completeRun: vi.fn(),
    };

    await expect(
      new CodexPrintAgentService({
        repository,
        probe: { validate: vi.fn() },
        runner: { run: vi.fn() },
      }).send("reviewer", "x"),
    ).rejects.toMatchObject({ code: "CODEX_UNSUPPORTED" });
    expect(repository.acquireRun).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("does not turn a successful completion write failure into a second completion", async () => {
    const completionFailure = new Error("completion failed");
    const repository = {
      resolve: vi.fn().mockResolvedValue(base),
      acquireRun: vi.fn().mockResolvedValue({ agent: base, token: "one" }),
      recordProviderProcess: vi.fn(),
      bindProviderSession: vi.fn(),
      completeRun: vi.fn().mockRejectedValue(completionFailure),
    };
    const runner = {
      run: vi.fn().mockResolvedValue({
        sessionId: SESSION,
        result: "answer",
        messages: ["answer"],
        exitCode: 0,
      }),
    };

    await expect(
      new CodexPrintAgentService({ repository, probe: { validate: vi.fn() }, runner }).send(
        "reviewer",
        "x",
      ),
    ).rejects.toBe(completionFailure);
    expect(repository.completeRun).toHaveBeenCalledOnce();
  });

  it("records a repository binding conflict as a session mismatch", async () => {
    const completeRun = vi.fn();
    const repository = {
      resolve: vi.fn().mockResolvedValue(base),
      acquireRun: vi.fn().mockResolvedValue({ agent: base, token: "one" }),
      recordProviderProcess: vi.fn(),
      bindProviderSession: vi
        .fn()
        .mockRejectedValue(new CodexPrintError("binding mismatch", "CODEX_SESSION_MISMATCH")),
      completeRun,
    };
    const runner = {
      run: vi.fn().mockImplementation(async (request) => {
        await request.onSession(SESSION);
        return { sessionId: SESSION, result: "x", messages: ["x"], exitCode: 0 };
      }),
    };
    await expect(
      new CodexPrintAgentService({ repository, probe: { validate: vi.fn() }, runner }).send(
        "reviewer",
        "x",
      ),
    ).rejects.toMatchObject({ code: "CODEX_SESSION_MISMATCH" });
    expect(completeRun).toHaveBeenCalledWith(
      "id",
      "one",
      expect.objectContaining({ sessionHealth: "mismatch" }),
    );
  });

  it("rejects missing and ambiguous records before acquiring a run", async () => {
    const repository = {
      create: vi.fn(),
      resolve: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce([base, base]),
      acquireRun: vi.fn(),
      recordProviderProcess: vi.fn(),
      bindProviderSession: vi.fn(),
      completeRun: vi.fn(),
    };
    const service = new CodexPrintAgentService({
      repository,
      probe: { validate: vi.fn() },
      runner: { run: vi.fn() },
    });
    await expect(service.send("missing", "x")).rejects.toMatchObject({
      code: "DURABLE_AGENT_NOT_FOUND",
    });
    await expect(service.send("ambiguous", "x")).rejects.toMatchObject({
      code: "CODEX_UNSUPPORTED",
    });
    expect(repository.acquireRun).not.toHaveBeenCalled();
  });
});
