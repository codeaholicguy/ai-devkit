import Database from "better-sqlite3";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenCodeSessionLocator } from "../../../providers/opencode/OpenCodeSessionLocator.js";
import { OpenCodeSessionParser } from "../../../providers/opencode/OpenCodeSessionParser.js";

describe("OpenCodeSessionLocator", () => {
  let tmpDir: string;
  let dbPath: string;
  let locator: OpenCodeSessionLocator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-locator-test-"));
    dbPath = path.join(tmpDir, "opencode.db");
    locator = new OpenCodeSessionLocator(dbPath, new OpenCodeSessionParser());
  });

  afterEach(() => {
    locator.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when the database file does not exist", () => {
    expect(locator.openDb()).toBeNull();
    expect(locator.listSessions()).toEqual([]);
  });

  it("finds the newest session for a directory", () => {
    writeDatabase(dbPath, [
      { id: "old", directory: "/repo", timeCreated: 1000 },
      { id: "new", directory: "/repo", timeCreated: 2000 },
      { id: "other", directory: "/other", timeCreated: 3000 },
    ]);

    const db = locator.openDb();
    expect(db).not.toBeNull();
    expect(locator.findSessionForDirectory(db!, "/repo")).toEqual({
      sessionId: "new",
      directory: "/repo",
      timeCreated: 2000,
    });
  });

  it("lists sessions and filters by cwd", () => {
    writeDatabase(dbPath, [
      { id: "sess-a", directory: "/repo-a", timeCreated: 1000 },
      { id: "sess-b", directory: "/repo-b", timeCreated: 2000 },
    ]);

    const sessions = locator.listSessions({ cwd: "/repo-a" });

    expect(sessions).toEqual([
      expect.objectContaining({
        type: "opencode",
        sessionId: "sess-a",
        cwd: "/repo-a",
        sessionFilePath: `${dbPath}::sess-a`,
      }),
    ]);
  });
});

function writeDatabase(
  filePath: string,
  sessions: Array<{ id: string; directory: string; timeCreated: number }>,
): void {
  const db = new Database(filePath);
  db.exec(`
    CREATE TABLE session (id TEXT, directory TEXT, time_created INTEGER);
    CREATE TABLE message (id TEXT, session_id TEXT, data TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE part (message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER);
  `);

  const insertSession = db.prepare(
    "INSERT INTO session (id, directory, time_created) VALUES (?, ?, ?)",
  );
  for (const session of sessions) {
    insertSession.run(session.id, session.directory, session.timeCreated);
  }

  db.close();
}
