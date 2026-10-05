import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DevinSessionLocator } from "../../../harnesses/devin/DevinSessionLocator.js";
import { writeDatabase, writeLocks } from "./fixtures.js";

describe("DevinSessionLocator", () => {
  let tmpDir: string;
  let dbPath: string;
  let locksDir: string;
  let locator: DevinSessionLocator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devin-locator-test-"));
    dbPath = path.join(tmpDir, "sessions.db");
    locksDir = path.join(tmpDir, "session_locks");
    locator = new DevinSessionLocator(dbPath, locksDir);
  });

  afterEach(() => {
    locator.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists active locks and skips malformed entries", () => {
    writeLocks(locksDir, { "alpha-session": 100, "beta-session": "200" });
    fs.writeFileSync(path.join(locksDir, "broken.lock"), "not-a-pid");
    fs.writeFileSync(path.join(locksDir, "empty.lock"), "");
    fs.writeFileSync(path.join(locksDir, ".lock"), "300");
    fs.writeFileSync(path.join(locksDir, "not-a-lock.txt"), "400");

    expect(locator.listActiveLocks()).toEqual([
      { sessionId: "alpha-session", pid: 100 },
      { sessionId: "beta-session", pid: 200 },
    ]);
  });

  it("returns an empty lock list when the directory is missing", () => {
    expect(locator.listActiveLocks()).toEqual([]);
  });

  it("finds the most recent visible session for a directory", () => {
    writeDatabase(dbPath, {
      sessions: [
        { id: "older", directory: "/repo", timeCreated: 100, lastActivityAt: 100 },
        { id: "newer", directory: "/repo", timeCreated: 200, lastActivityAt: 300 },
        { id: "hidden", directory: "/repo", timeCreated: 400, lastActivityAt: 400, hidden: 1 },
      ],
    });

    const db = locator.openDb()!;
    expect(locator.findSessionForDirectory(db, "/repo")?.sessionId).toBe("newer");
    expect(locator.findSessionForDirectory(db, "/missing")).toBeNull();
  });

  it("finds a session by id for the lock join", () => {
    writeDatabase(dbPath, {
      sessions: [
        { id: "by-id", directory: "/repo", timeCreated: 100, title: "Title" },
        { id: "gone", directory: "/repo", timeCreated: 100, hidden: 1 },
      ],
    });

    const db = locator.openDb()!;
    const session = locator.findSessionById(db, "by-id");
    expect(session).toMatchObject({
      sessionId: "by-id",
      directory: "/repo",
      title: "Title",
      timeCreated: 100_000,
    });
    expect(locator.findSessionById(db, "gone")).toBeNull();
    expect(locator.findSessionById(db, "missing")).toBeNull();
  });

  it("lists sessions with cwd filtering, hidden skip, and prompt summary", () => {
    writeDatabase(dbPath, {
      sessions: [
        { id: "a", directory: "/repo", timeCreated: 100, lastActivityAt: 150 },
        { id: "b", directory: "/other", timeCreated: 200, lastActivityAt: 250 },
        { id: "c", directory: "/repo", timeCreated: 300, hidden: 1 },
      ],
      prompts: [
        { sessionId: "a", content: "first prompt", timestamp: 110 },
        { sessionId: "a", content: "!shell cmd", timestamp: 105, isShell: 1 },
        { sessionId: "b", content: "other prompt", timestamp: 210 },
      ],
    });

    const all = locator.listSessions();
    expect(all.map((s) => s.sessionId)).toEqual(["b", "a"]);

    const filtered = locator.listSessions({ cwd: "/repo" });
    expect(filtered).toEqual([
      expect.objectContaining({
        type: "devin",
        sessionId: "a",
        cwd: "/repo",
        firstUserMessage: "first prompt",
        lastActive: new Date(150_000),
        startedAt: new Date(100_000),
        sessionFilePath: `${dbPath}::a`,
      }),
    ]);
  });

  it("resolves the db path from XDG_DATA_HOME or ~/.local/share", () => {
    const prevXdg = process.env.XDG_DATA_HOME;
    const prevHome = process.env.HOME;
    try {
      process.env.XDG_DATA_HOME = "/xdg";
      expect(DevinSessionLocator.resolveDbPath()).toBe(
        path.join("/xdg", "devin", "cli", "sessions.db"),
      );
      delete process.env.XDG_DATA_HOME;
      process.env.HOME = "/home/u";
      expect(DevinSessionLocator.resolveDbPath()).toBe(
        path.join("/home/u", ".local", "share", "devin", "cli", "sessions.db"),
      );
    } finally {
      if (prevXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prevXdg;
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("returns empty results when the database is missing or corrupt", () => {
    expect(locator.openDb()).toBeNull();
    expect(locator.listSessions()).toEqual([]);
    expect(locator.findSessionsById("x")).toEqual([]);

    fs.writeFileSync(dbPath, "garbage");
    const fresh = new DevinSessionLocator(dbPath, locksDir);
    expect(fresh.listSessions()).toEqual([]);
    fresh.close();
  });
});
