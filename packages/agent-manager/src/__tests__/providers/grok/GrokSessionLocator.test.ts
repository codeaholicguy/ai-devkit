import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProcessInfo } from "../../../adapters/AgentAdapter.js";
import { GrokSessionLocator } from "../../../providers/grok/GrokSessionLocator.js";

describe("GrokSessionLocator", () => {
  let baseDir: string;
  let locator: GrokSessionLocator;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "grok-locator-test-"));
    locator = new GrokSessionLocator({ baseDir });
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  function writeSession(cwd: string, id: string, mtime?: Date): string {
    const sessionDir = path.join(baseDir, "sessions", encodeURIComponent(cwd), id);
    fs.mkdirSync(sessionDir, { recursive: true });
    const chatPath = path.join(sessionDir, "chat_history.jsonl");
    fs.writeFileSync(chatPath, "");
    if (mtime) fs.utimesSync(chatPath, mtime, mtime);
    return sessionDir;
  }

  function proc(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
    return { pid: 4242, command: "grok", cwd: "/repo/app", tty: "ttys001", ...overrides };
  }

  describe("matchRunningProcesses", () => {
    it("prefers the active_sessions.json cwd over the process cwd", () => {
      const sessionDir = writeSession("/repo/real", "s1");
      fs.writeFileSync(
        path.join(baseDir, "active_sessions.json"),
        JSON.stringify([{ pid: 4242, cwd: "/repo/real" }]),
      );

      expect(locator.matchRunningProcesses([proc({ cwd: "/wrong" })])).toEqual([
        { process: expect.objectContaining({ pid: 4242 }), cwd: "/repo/real", sessionDir },
      ]);
    });

    it("ignores a malformed active_sessions.json and falls back to the process cwd", () => {
      const sessionDir = writeSession("/repo/app", "s1");
      fs.writeFileSync(path.join(baseDir, "active_sessions.json"), "{not json");

      expect(locator.matchRunningProcesses([proc()])[0]).toMatchObject({
        cwd: "/repo/app",
        sessionDir,
      });
    });

    it("picks the session with the newest chat_history.jsonl", () => {
      writeSession("/repo/app", "old", new Date(Date.now() - 60_000));
      const newest = writeSession("/repo/app", "new");

      expect(locator.matchRunningProcesses([proc()])[0].sessionDir).toBe(newest);
    });

    it("returns a null sessionDir when no cwd is known", () => {
      expect(locator.matchRunningProcesses([proc({ cwd: "" })])[0]).toMatchObject({
        cwd: "",
        sessionDir: null,
      });
    });
  });

  describe("historical sessions", () => {
    it("discovers session dirs with the decoded group cwd", () => {
      const a = writeSession("/repo/a", "s1");
      const b = writeSession("/repo/b", "s2");

      expect(locator.discoverHistoricalSessionDirs()).toEqual(
        expect.arrayContaining([
          { sessionDir: a, defaultCwd: "/repo/a" },
          { sessionDir: b, defaultCwd: "/repo/b" },
        ]),
      );
    });

    it("prefers the .cwd file over the encoded group name", () => {
      const groupDir = path.join(baseDir, "sessions", "slug-abc123");
      fs.mkdirSync(path.join(groupDir, "s1"), { recursive: true });
      fs.writeFileSync(path.join(groupDir, ".cwd"), "/very/long/path\n");

      expect(locator.discoverHistoricalSessionDirs()).toEqual([
        { sessionDir: path.join(groupDir, "s1"), defaultCwd: "/very/long/path" },
      ]);
    });

    it("finds session dirs by id and rejects unsafe ids", () => {
      const dir = writeSession("/repo/a", "s1");
      writeSession("/repo/b", "s2");

      expect(locator.findHistoricalSessionDirsById("s1")).toEqual([
        { sessionDir: dir, defaultCwd: "/repo/a" },
      ]);
      expect(locator.findHistoricalSessionDirsById("../s1")).toEqual([]);
    });
  });
});
