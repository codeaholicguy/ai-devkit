import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const netCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("node:net", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:net");
  const spy = (...args: unknown[]) => {
    netCalls.count++;
    return (actual.createConnection as (...a: unknown[]) => unknown)(...args);
  };
  return {
    ...actual,
    createConnection: spy,
    connect: spy,
    default: { ...actual, createConnection: spy, connect: spy },
  };
});

import extension from "../extensions/index.js";

type Handler = (event: unknown, ctx: unknown) => Promise<void>;

function load(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  extension({
    on: (name: string, handler: Handler) => {
      handlers[name] = handler;
    },
  } as never);
  return handlers;
}

const ctxFor = (sessionFile: string | undefined) => ({
  sessionManager: { getSessionFile: () => sessionFile },
});

describe("pi-session-tracker extension", () => {
  let home: string;
  let originalHome: string | undefined;
  let registryPath: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tracker-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    registryPath = path.join(home, ".pi", "agent", "sessions.json");
    netCalls.count = 0;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const readRegistry = () => JSON.parse(fs.readFileSync(registryPath, "utf8"));

  it("writes the pid entry on session_start with no daemon present and no socket calls", async () => {
    const handlers = load();
    await handlers.session_start({}, ctxFor("/sessions/a.jsonl"));

    expect(readRegistry()).toEqual({ [String(process.pid)]: "/sessions/a.jsonl" });
    expect(netCalls.count).toBe(0);
    expect(fs.existsSync(path.join(home, ".ai-devkit", "daemon.sock"))).toBe(false);
  });

  it("overwrites the entry when the session restarts in the same process", async () => {
    const handlers = load();
    await handlers.session_start({}, ctxFor("/sessions/old.jsonl"));
    await handlers.session_start({}, ctxFor("/sessions/new.jsonl"));

    expect(readRegistry()[String(process.pid)]).toBe("/sessions/new.jsonl");
  });

  it("preserves other pids' entries and records ephemeral sessions", async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify({ "1": "/sessions/other.jsonl" }));

    const handlers = load();
    await handlers.session_start({}, ctxFor(undefined));

    expect(readRegistry()).toEqual({
      "1": "/sessions/other.jsonl",
      [String(process.pid)]: "ephemeral",
    });
  });

  it("recovers from an invalid registry file", async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, "{not json");

    const handlers = load();
    await handlers.session_start({}, ctxFor("/sessions/a.jsonl"));

    expect(readRegistry()).toEqual({ [String(process.pid)]: "/sessions/a.jsonl" });
  });

  it("removes only its own entry on session_shutdown without socket calls", async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(
      registryPath,
      JSON.stringify({ "1": "/sessions/other.jsonl", [String(process.pid)]: "/sessions/a.jsonl" }),
    );

    const handlers = load();
    await handlers.session_shutdown({}, {});

    expect(readRegistry()).toEqual({ "1": "/sessions/other.jsonl" });
    expect(netCalls.count).toBe(0);
    expect(fs.readdirSync(path.dirname(registryPath))).toEqual(["sessions.json"]);
  });
});
