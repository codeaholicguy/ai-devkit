import { chmod, mkdtemp, rm, stat as fsStat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AntigravityCliError,
  classifyAntigravityExitFailure,
  fetchAntigravityRemoteCapacity,
  isSupportedAntigravityVersion,
  parseAntigravityUsageReport,
  parseAntigravityVersion,
} from "../../src/capacity/providers/antigravity.js";
import { resolveAntigravityOAuthCredential } from "../../src/harnesses/antigravity/credentials.js";
import {
  probeAntigravityCapacity,
  resetAntigravityVersionCache,
  type AntigravityExecOptions,
} from "../../src/capacity/sources/antigravity.js";

const FULL_USAGE_REPORT = {
  conversation_id: "",
  status: "SUCCESS",
  response: "Synthetic quota report",
  command: {
    name: "usage",
    data: {
      description: "Models share limits",
      groups: [
        {
          name: "Gemini Models",
          description: "Gemini models",
          buckets: [
            {
              id: "gemini-weekly",
              name: "Weekly Limit Remaining",
              description: "Weekly limit",
              window: "weekly",
              remaining_fraction: 0.86,
              reset_time: "2026-09-17T18:40:27Z",
            },
            {
              id: "gemini-5h",
              name: "Five Hour Limit Remaining",
              description: "5-hour limit",
              window: "5h",
              remaining_fraction: 0.95,
              reset_time: "2026-09-13T03:48:04Z",
            },
          ],
        },
        {
          name: "Claude and GPT models",
          description: "3p models",
          buckets: [
            {
              id: "3p-weekly",
              name: "Weekly Limit Remaining",
              description: "Weekly limit",
              window: "weekly",
              remaining_fraction: 0.89,
              reset_time: "2026-09-17T02:38:46Z",
            },
            {
              id: "3p-5h",
              name: "Five Hour Limit Remaining",
              window: "5h",
              remaining_fraction: 1.0,
              reset_time: "2026-09-13T05:29:19Z",
            },
          ],
        },
      ],
    },
  },
};

describe("Antigravity version parsing", () => {
  it("parses semantic versions from agy --version output", () => {
    expect(parseAntigravityVersion("agy 1.2.11\n")).toEqual([1, 2, 11]);
    expect(parseAntigravityVersion("antigravity-cli v1.1.11-beta.1")).toEqual([1, 1, 11]);
    expect(parseAntigravityVersion("1.1.10")).toEqual([1, 1, 10]);
    expect(parseAntigravityVersion("unknown")).toBeNull();
  });

  it("checks minimum supported print-mode version >= 1.1.11", () => {
    expect(isSupportedAntigravityVersion([1, 1, 10])).toBe(false);
    expect(isSupportedAntigravityVersion([1, 0, 99])).toBe(false);
    expect(isSupportedAntigravityVersion([1, 1, 11])).toBe(true);
    expect(isSupportedAntigravityVersion([1, 2, 0])).toBe(true);
    expect(isSupportedAntigravityVersion([2, 0, 0])).toBe(true);
  });
});

describe("parseAntigravityUsageReport", () => {
  it("parses multi-family 5h and weekly buckets into CapacityWindows", () => {
    const snapshot = parseAntigravityUsageReport(FULL_USAGE_REPORT);

    expect(snapshot).toEqual({
      authenticated: true,
      available: "yes",
      creditsRemaining: null,
      windows: [
        {
          id: "antigravity:gemini-weekly",
          label: "Gemini Models · Weekly",
          durationMinutes: 10080,
          usedPercent: 14,
          resetsAt: "2026-09-17T18:40:27.000Z",
        },
        {
          id: "antigravity:gemini-5h",
          label: "Gemini Models · 5h",
          durationMinutes: 300,
          usedPercent: 5,
          resetsAt: "2026-09-13T03:48:04.000Z",
        },
        {
          id: "antigravity:3p-weekly",
          label: "Claude and GPT models · Weekly",
          durationMinutes: 10080,
          usedPercent: 11,
          resetsAt: "2026-09-17T02:38:46.000Z",
        },
        {
          id: "antigravity:3p-5h",
          label: "Claude and GPT models · 5h",
          durationMinutes: 300,
          usedPercent: 0,
          resetsAt: "2026-09-13T05:29:19.000Z",
        },
      ],
    });
  });

  it("parses weekly-only Starter tiers without fabricating 5-hour windows", () => {
    const snapshot = parseAntigravityUsageReport({
      status: "SUCCESS",
      command: {
        name: "usage",
        data: {
          groups: [
            {
              display_name: "Gemini Models",
              buckets: [
                {
                  bucket_id: "gemini-weekly",
                  display_name: "Weekly Limit Remaining",
                  window: "weekly",
                  remaining_fraction: 0.99,
                },
              ],
            },
            {
              display_name: "Gemini 4 Argon",
              buckets: [
                {
                  bucket_id: "gemini-argon-wtu-weekly",
                  display_name: "Gemini 4 Argon Weekly Limit",
                  window: "weekly",
                  remaining_fraction: 0.53,
                  reset_time: "2026-10-23T10:24:14Z",
                },
              ],
            },
          ],
        },
      },
    });

    expect(snapshot.windows).toHaveLength(2);
    expect(snapshot.windows).toEqual([
      {
        id: "antigravity:gemini-weekly",
        label: "Gemini Models · Weekly",
        durationMinutes: 10080,
        usedPercent: 1,
        resetsAt: null,
      },
      {
        id: "antigravity:gemini-argon-wtu-weekly",
        label: "Gemini 4 Argon · Weekly",
        durationMinutes: 10080,
        usedPercent: 47,
        resetsAt: "2026-10-23T10:24:14.000Z",
      },
    ]);
  });

  it("supports nested remaining_fraction, oneof remaining, clamping, and epoch-seconds reset_time", () => {
    const snapshot = parseAntigravityUsageReport({
      status: "SUCCESS",
      command: {
        name: "usage",
        data: {
          groups: [
            {
              name: "Gemini Models",
              buckets: [
                {
                  id: "nested-fraction",
                  name: "5h",
                  window: "five_hour",
                  remaining: { remaining_fraction: 1.5 },
                  reset_time: 1789670400,
                },
                {
                  id: "oneof-fraction",
                  name: "Weekly",
                  window: "7d",
                  remaining: { case: "remainingFraction", value: -0.2 },
                  reset_time: "1789756800",
                },
              ],
            },
          ],
        },
      },
    });

    expect(snapshot.windows).toEqual([
      {
        id: "antigravity:nested-fraction",
        label: "Gemini Models · 5h",
        durationMinutes: 300,
        usedPercent: 0,
        resetsAt: new Date(1789670400 * 1000).toISOString(),
      },
      {
        id: "antigravity:oneof-fraction",
        label: "Gemini Models · Weekly",
        durationMinutes: 10080,
        usedPercent: 100,
        resetsAt: new Date(1789756800 * 1000).toISOString(),
      },
    ]);
    expect(snapshot.available).toBe("yes");
  });

  it("marks available as no when all measured enabled buckets are exhausted and skips disabled buckets", () => {
    const snapshot = parseAntigravityUsageReport({
      status: "SUCCESS",
      command: {
        name: "usage",
        data: {
          groups: [
            {
              name: "Gemini Models",
              buckets: [
                {
                  id: "gemini-5h",
                  window: "5h",
                  remaining_fraction: 0,
                },
                {
                  id: "gemini-disabled",
                  window: "weekly",
                  remaining_fraction: 1,
                  disabled: true,
                },
              ],
            },
          ],
        },
      },
    });

    expect(snapshot.windows).toHaveLength(1);
    expect(snapshot.windows[0].usedPercent).toBe(100);
    expect(snapshot.available).toBe("no");
  });

  it("rejects non-SUCCESS status, wrong command name, or missing enabled quota", () => {
    expect(() => parseAntigravityUsageReport({ ...FULL_USAGE_REPORT, status: "ERROR" })).toThrow(
      /unsuccessful/i,
    );
    expect(() =>
      parseAntigravityUsageReport({
        status: "SUCCESS",
        command: { name: "status", data: { groups: [] } },
      }),
    ).toThrow(/unsuccessful/i);
    expect(() =>
      parseAntigravityUsageReport({
        status: "SUCCESS",
        command: {
          name: "usage",
          data: {
            groups: [
              {
                name: "Gemini Models",
                buckets: [{ id: "only-disabled", disabled: true, remaining_fraction: 0.5 }],
              },
            ],
          },
        },
      }),
    ).toThrow(/no known quota/i);
  });
});

describe("classifyAntigravityExitFailure", () => {
  it("classifies sign-in errors as authentication_required without leaking stderr", () => {
    const err = classifyAntigravityExitFailure(
      1,
      "Error: user alice@example.com is not logged in via https://secret.example/avatar.png",
    );
    expect(err).toBeInstanceOf(AntigravityCliError);
    expect(err.kind).toBe("authentication_required");
    expect(err.message).not.toContain("alice@example.com");
    expect(err.message).not.toContain("secret.example");
  });

  it("classifies eligibility, network, and generic exit codes with sanitized messages", () => {
    const ineligible = classifyAntigravityExitFailure(
      2,
      "Eligibility check failed: unsupported region /Users/alice",
    );
    expect(ineligible.kind).toBe("ineligible");
    expect(ineligible.message).not.toContain("/Users/alice");

    const eligNet = classifyAntigravityExitFailure(
      2,
      "Eligibility check failed: dial tcp: no such host",
    );
    expect(eligNet.kind).toBe("eligibility_network");
    expect(eligNet.message).toContain("network");

    const net = classifyAntigravityExitFailure(
      1,
      'Get "https://internal.proxy.local": connection refused',
    );
    expect(net.kind).toBe("network");
    expect(net.message).not.toContain("internal.proxy.local");

    const generic = classifyAntigravityExitFailure(42, "panic: secret token abcdef");
    expect(generic.kind).toBe("exited");
    expect(generic.message).toBe("agy exited 42");
  });
});

describe("probeAntigravityCapacity", () => {
  const checkedAt = "2026-11-19T12:00:00.000Z";
  const noCredentialFile = async () => {
    throw new Error("ENOENT");
  };

  beforeEach(() => {
    resetAntigravityVersionCache();
  });

  it("treats ANTIGRAVITY_CLI_PATH as authoritative without falling back to PATH", async () => {
    const access = vi.fn(async (target: string) => {
      if (target === "/usr/local/bin/agy") return;
      throw new Error("ENOENT");
    });

    await expect(
      probeAntigravityCapacity({
        checkedAt,
        env: { ANTIGRAVITY_CLI_PATH: "/custom/missing/agy", PATH: "/usr/local/bin" },
        access,
        readFile: noCredentialFile,
      }),
    ).rejects.toThrow("agy executable not found");

    await expect(
      probeAntigravityCapacity({
        checkedAt,
        env: { ANTIGRAVITY_CLI_PATH: "   ", PATH: "/usr/local/bin" },
        access,
        readFile: noCredentialFile,
      }),
    ).rejects.toThrow("agy executable not found");
  });

  it("discovers agy via well-known install paths when not on PATH", async () => {
    const exec = vi.fn(async (opts: AntigravityExecOptions) => {
      if (opts.args[0] === "--version") return { exitCode: 0, stdout: "agy 1.2.11\n", stderr: "" };
      return { exitCode: 0, stdout: JSON.stringify(FULL_USAGE_REPORT), stderr: "" };
    });

    const report = await probeAntigravityCapacity({
      checkedAt,
      env: { PATH: "/usr/bin", HOME: "/users/test" },
      access: async (target: string) => {
        if (target !== "/opt/homebrew/bin/agy") throw new Error("ENOENT");
      },
      stat: async () => ({ size: 100, mtimeMs: 100, ino: 1 }),
      readFile: noCredentialFile,
      exec,
    });

    expect(report.authenticated).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      expect.objectContaining({ command: "/opt/homebrew/bin/agy" }),
    );
  });

  it("does not cache failed or unknown version checks", async () => {
    let attempt = 0;
    const exec = vi.fn(async (opts: AntigravityExecOptions) => {
      if (opts.args[0] === "--version") {
        attempt += 1;
        return attempt === 1
          ? { exitCode: 1, stdout: "", stderr: "transient error" }
          : { exitCode: 0, stdout: "agy 1.2.11\n", stderr: "" };
      }
      return { exitCode: 0, stdout: JSON.stringify(FULL_USAGE_REPORT), stderr: "" };
    });

    const common = {
      checkedAt,
      env: { ANTIGRAVITY_CLI_PATH: "/opt/bin/agy" },
      access: async () => undefined,
      stat: async () => ({ size: 100, mtimeMs: 100, ino: 1 }),
      readFile: noCredentialFile,
      exec,
    };

    await expect(probeAntigravityCapacity(common)).rejects.toThrow(/1\.1\.11/);
    const report = await probeAntigravityCapacity(common);
    expect(report.authenticated).toBe(true);
    expect(attempt).toBe(2);
  });

  it("caches agy --version by binary stat identity and invalidates when stat changes", async () => {
    let mtimeMs = 1000;
    const calls: AntigravityExecOptions[] = [];
    const exec = vi.fn(async (opts: AntigravityExecOptions) => {
      calls.push(opts);
      if (opts.args[0] === "--version") {
        return { exitCode: 0, stdout: "agy 1.2.11\n", stderr: "" };
      }
      return { exitCode: 0, stdout: JSON.stringify(FULL_USAGE_REPORT), stderr: "" };
    });

    const common = {
      checkedAt,
      env: { PATH: "/opt/bin", HOME: "/users/test" },
      access: async (target: string) => {
        if (target !== "/opt/bin/agy") throw new Error("ENOENT");
      },
      stat: async () => ({ size: 1234, mtimeMs, ino: 99 }),
      readFile: noCredentialFile,
      exec,
    };

    const first = await probeAntigravityCapacity(common);
    const second = await probeAntigravityCapacity(common);
    expect(first.harness).toBe("antigravity");
    expect(first.provider).toBe("antigravity");
    expect(second.windows).toHaveLength(4);
    expect(calls.filter((c) => c.args[0] === "--version")).toHaveLength(1);

    mtimeMs = 2000;
    await probeAntigravityCapacity(common);
    expect(calls.filter((c) => c.args[0] === "--version")).toHaveLength(2);
  });

  it("rejects agy versions below 1.1.11 without launching print mode", async () => {
    const exec = vi.fn(async (opts: AntigravityExecOptions) => {
      if (opts.args[0] === "--version") {
        return { exitCode: 0, stdout: "agy 1.1.10\n", stderr: "" };
      }
      throw new Error("should not run usage command");
    });

    await expect(
      probeAntigravityCapacity({
        checkedAt,
        env: { ANTIGRAVITY_CLI_PATH: "/opt/bin/agy" },
        access: async () => undefined,
        stat: async () => ({ size: 100, mtimeMs: 100, ino: 1 }),
        readFile: noCredentialFile,
        exec,
      }),
    ).rejects.toThrow(/1\.1\.11/);

    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("enforces auto-update disable, 0700 temp cwd, failing browser stubs, and cleans up temp dir", async () => {
    let observedCwd = "";
    let observedEnv: NodeJS.ProcessEnv = {};
    let dirMode = 0;
    let openStubMode = 0;

    const exec = vi.fn(async (opts: AntigravityExecOptions) => {
      if (opts.args[0] === "--version") {
        expect(opts.env.AGY_CLI_DISABLE_AUTO_UPDATE).toBe("true");
        return { exitCode: 0, stdout: "agy 1.2.11\n", stderr: "" };
      }
      observedCwd = opts.cwd;
      observedEnv = opts.env;
      dirMode = (await fsStat(opts.cwd)).mode & 0o777;
      openStubMode = (await fsStat(path.join(opts.cwd, "open"))).mode & 0o777;
      await fsStat(path.join(opts.cwd, "xdg-open"));
      return { exitCode: 0, stdout: JSON.stringify(FULL_USAGE_REPORT), stderr: "" };
    });

    const report = await probeAntigravityCapacity({
      checkedAt,
      env: { ANTIGRAVITY_CLI_PATH: "/opt/bin/agy", PATH: "/usr/bin" },
      access: async () => undefined,
      stat: async () => ({ size: 100, mtimeMs: 100, ino: 1 }),
      readFile: noCredentialFile,
      exec,
    });

    expect(report.authenticated).toBe(true);
    expect(observedEnv.AGY_CLI_DISABLE_AUTO_UPDATE).toBe("true");
    expect(observedEnv.PATH?.startsWith(`${observedCwd}${path.delimiter}`)).toBe(true);
    expect(observedEnv.BROWSER).toBe(path.join(observedCwd, "open"));
    expect(dirMode).toBe(0o700);
    expect(openStubMode & 0o100).toBe(0o100);
    await expect(fsStat(observedCwd)).rejects.toThrow();
  });

  it("returns an unauthenticated report instead of throwing when agy requires sign-in", async () => {
    const exec = vi.fn(async (opts: AntigravityExecOptions) => {
      if (opts.args[0] === "--version") {
        return { exitCode: 0, stdout: "agy 1.2.11\n", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "Please sign in with Google to continue" };
    });

    const report = await probeAntigravityCapacity({
      checkedAt,
      env: { ANTIGRAVITY_CLI_PATH: "/opt/bin/agy" },
      access: async () => undefined,
      stat: async () => ({ size: 100, mtimeMs: 100, ino: 1 }),
      readFile: noCredentialFile,
      exec,
    });

    expect(report).toEqual({
      harness: "antigravity",
      provider: "antigravity",
      generatedAt: checkedAt,
      authenticated: false,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    });
  });

  it("executes real subprocess safeguards including browser stubs, timeout, and output cap", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agy-fake-bin-"));
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ANTIGRAVITY_ACCESS_TOKEN: undefined,
      ANTIGRAVITY_OAUTH_CREDENTIALS_JSON: undefined,
    };
    try {
      const okBin = path.join(dir, "agy-ok");
      await writeFile(
        okBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "agy 1.2.11"
  exit 0
fi
if [ "$AGY_CLI_DISABLE_AUTO_UPDATE" != "true" ]; then
  echo "missing auto-update guard" >&2
  exit 2
fi
if open https://example.com >/dev/null 2>&1; then
  echo "open stub should fail" >&2
  exit 3
fi
cat <<'EOF'
${JSON.stringify(FULL_USAGE_REPORT)}
EOF
`,
        "utf8",
      );
      await chmod(okBin, 0o700);

      const report = await probeAntigravityCapacity({
        checkedAt,
        env: { ...baseEnv, ANTIGRAVITY_CLI_PATH: okBin },
        readFile: noCredentialFile,
        timeoutMs: 5000,
      });
      expect(report.authenticated).toBe(true);
      expect(report.windows).toHaveLength(4);

      const slowBin = path.join(dir, "agy-slow");
      await writeFile(
        slowBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "agy 1.2.11"; exit 0; fi
sleep 5
`,
        "utf8",
      );
      await chmod(slowBin, 0o700);

      await expect(
        probeAntigravityCapacity({
          checkedAt,
          env: { ...baseEnv, ANTIGRAVITY_CLI_PATH: slowBin },
          readFile: noCredentialFile,
          timeoutMs: 150,
        }),
      ).rejects.toThrow(/timed out/i);

      const loudBin = path.join(dir, "agy-loud");
      await writeFile(
        loudBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo "agy 1.2.11"; exit 0; fi
head -c 2048 /dev/zero | tr '\\0' 'a'
`,
        "utf8",
      );
      await chmod(loudBin, 0o700);

      await expect(
        probeAntigravityCapacity({
          checkedAt,
          env: { ...baseEnv, ANTIGRAVITY_CLI_PATH: loudBin },
          readFile: noCredentialFile,
          timeoutMs: 5000,
          maxOutputBytes: 512,
        }),
      ).rejects.toThrow(/output/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses direct Cloud Code OAuth fast path without spawning agy when OAuth credential is available", async () => {
    const exec = vi.fn();
    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.includes("loadCodeAssist")) {
        return new Response(JSON.stringify({ cloudaicompanionProject: "proj-123" }), {
          status: 200,
        });
      }
      if (target.includes("retrieveUserQuotaSummary")) {
        return new Response(
          JSON.stringify({
            groups: FULL_USAGE_REPORT.command.data.groups,
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const report = await probeAntigravityCapacity({
      checkedAt,
      env: { ANTIGRAVITY_ACCESS_TOKEN: "fake-oauth-access-token" },
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      exec,
    });

    expect(report).toMatchObject({
      harness: "antigravity",
      provider: "antigravity",
      generatedAt: checkedAt,
      authenticated: true,
      available: "yes",
    });
    expect(report.windows).toHaveLength(4);
    expect(exec).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to agy CLI when remote Cloud Code OAuth fetch fails", async () => {
    const exec = vi.fn(async (opts: AntigravityExecOptions) => {
      if (opts.args[0] === "--version") return { exitCode: 0, stdout: "agy 1.2.11\n", stderr: "" };
      return { exitCode: 0, stdout: JSON.stringify(FULL_USAGE_REPORT), stderr: "" };
    });
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));

    const report = await probeAntigravityCapacity({
      checkedAt,
      env: {
        ANTIGRAVITY_ACCESS_TOKEN: "expired-fake-token",
        ANTIGRAVITY_CLI_PATH: "/opt/bin/agy",
      },
      access: async () => undefined,
      stat: async () => ({ size: 100, mtimeMs: 100, ino: 1 }),
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      exec,
    });

    expect(report.authenticated).toBe(true);
    expect(report.windows).toHaveLength(4);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe("Antigravity OAuth credentials and Cloud Code remote fetch", () => {
  const now = new Date("2026-11-19T12:00:00.000Z");

  it("resolves credentials from env token, env JSON, agy file storage, or codexbar file", async () => {
    const fromEnv = await resolveAntigravityOAuthCredential({
      now: () => now,
      env: { ANTIGRAVITY_ACCESS_TOKEN: "tok-env", ANTIGRAVITY_PROJECT_ID: "proj-env" },
    });
    expect(fromEnv).toEqual({ accessToken: "tok-env", projectId: "proj-env" });

    const fromAgyFile = await resolveAntigravityOAuthCredential({
      now: () => now,
      env: { HOME: "/users/test" },
      readFile: async (target) => {
        if (target === "/users/test/.gemini/antigravity-cli/antigravity-oauth-token") {
          return JSON.stringify({
            token: {
              access_token: "tok-agy-file",
              expiry: "2026-11-19T13:00:00.000Z",
            },
          });
        }
        throw new Error("ENOENT");
      },
    });
    expect(fromAgyFile).toEqual({ accessToken: "tok-agy-file", projectId: null });

    const expired = await resolveAntigravityOAuthCredential({
      now: () => now,
      env: { HOME: "/users/test" },
      readFile: async (target) => {
        if (target === "/users/test/.gemini/antigravity-cli/antigravity-oauth-token") {
          return JSON.stringify({
            token: {
              access_token: "tok-expired",
              expiry: "2026-11-19T11:59:00.000Z",
            },
          });
        }
        throw new Error("ENOENT");
      },
    });
    expect(expired).toBeNull();
  });

  it("fetches Cloud Code quota summary with Hub User-Agent and skips loadCodeAssist when projectId is known", async () => {
    const requests: Array<{
      url: string;
      headers: HeadersInit | undefined;
      body: string | undefined;
    }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        headers: init?.headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return new Response(
        JSON.stringify({
          summary: { groups: FULL_USAGE_REPORT.command.data.groups },
        }),
        { status: 200 },
      );
    });

    const snapshot = await fetchAntigravityRemoteCapacity(
      { accessToken: "secret-access-token", projectId: "proj-known" },
      { fetch: fetchMock as unknown as typeof globalThis.fetch },
    );

    expect(snapshot.windows).toHaveLength(4);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
    );
    expect(requests[0].body).toBe(JSON.stringify({ project: "proj-known" }));
    const headers = requests[0].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-access-token");
    expect(headers["User-Agent"]).toMatch(
      /^antigravity\/hub\/2\.9\.1 (darwin|linux)\/(arm64|amd64)$/,
    );
  });
});
