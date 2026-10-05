import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

export interface DevinSessionInput {
  id: string;
  directory: string;
  title?: string | null;
  timeCreated: number;
  lastActivityAt?: number;
  mainChainId?: number | null;
  hidden?: number;
}

export interface DevinNodeInput {
  nodeId: number;
  parentNodeId?: number | null;
  role: string;
  content?: string;
  messageId?: string;
  createdAt?: number;
  isUserInput?: boolean;
  toolCalls?: { name?: string; function?: { name?: string } }[];
  thinking?: string;
  name?: string;
  /** Raw chat_message text; when set, other fields are ignored. */
  raw?: string;
}

export interface DevinPromptInput {
  sessionId: string;
  content: string;
  timestamp?: number;
  isShell?: number;
}

export function writeDatabase(
  dbPath: string,
  data: {
    sessions?: DevinSessionInput[];
    nodes?: (DevinNodeInput & { sessionId: string })[];
    prompts?: DevinPromptInput[];
  },
): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        working_directory TEXT NOT NULL,
        backend_type TEXT NOT NULL DEFAULT 'local',
        model TEXT NOT NULL DEFAULT 'test-model',
        agent_mode TEXT NOT NULL DEFAULT 'normal',
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        title TEXT,
        main_chain_id INTEGER,
        hidden INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS message_nodes (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        node_id INTEGER NOT NULL,
        parent_node_id INTEGER,
        chat_message TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(session_id, node_id)
      );
      CREATE TABLE IF NOT EXISTS prompt_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        is_shell INTEGER NOT NULL DEFAULT 0
      );
    `);

    const insertSession = db.prepare(`
      INSERT INTO sessions (id, working_directory, created_at, last_activity_at, title, main_chain_id, hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const session of data.sessions ?? []) {
      insertSession.run(
        session.id,
        session.directory,
        session.timeCreated,
        session.lastActivityAt ?? session.timeCreated,
        session.title ?? null,
        session.mainChainId ?? null,
        session.hidden ?? 0,
      );
    }

    const insertNode = db.prepare(`
      INSERT INTO message_nodes (session_id, node_id, parent_node_id, chat_message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const node of data.nodes ?? []) {
      const chatMessage =
        node.raw ??
        JSON.stringify({
          message_id: node.messageId ?? `msg-${node.nodeId}`,
          role: node.role,
          content: node.content ?? "",
          ...(node.toolCalls ? { tool_calls: node.toolCalls } : {}),
          ...(node.thinking ? { thinking: { thinking: node.thinking } } : {}),
          ...(node.name ? { name: node.name } : {}),
          ...(node.isUserInput !== undefined
            ? { metadata: { is_user_input: node.isUserInput } }
            : {}),
        });
      insertNode.run(
        node.sessionId,
        node.nodeId,
        node.parentNodeId ?? null,
        chatMessage,
        node.createdAt ?? 1000 + node.nodeId,
      );
    }

    const insertPrompt = db.prepare(`
      INSERT INTO prompt_history (session_id, content, timestamp, is_shell)
      VALUES (?, ?, ?, ?)
    `);
    for (const prompt of data.prompts ?? []) {
      insertPrompt.run(
        prompt.sessionId,
        prompt.content,
        prompt.timestamp ?? 1000,
        prompt.isShell ?? 0,
      );
    }
  } finally {
    db.close();
  }
}

export function writeLocks(locksDir: string, locks: Record<string, number | string>): void {
  fs.mkdirSync(locksDir, { recursive: true });
  for (const [sessionId, pid] of Object.entries(locks)) {
    fs.writeFileSync(path.join(locksDir, `${sessionId}.lock`), String(pid));
  }
}
