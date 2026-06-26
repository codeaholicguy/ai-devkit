const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readHookInput() {
  if (process.stdin.isTTY) return {};

  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function nestedValue(input, keys) {
  for (const source of [input, input?.payload, input?.session, input?.thread]) {
    if (!source || typeof source !== 'object') continue;

    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
    }
  }

  return undefined;
}

function envValue(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value?.trim()) return value.trim();
  }

  return undefined;
}

function findSessionFileById(homeDir, sessionId) {
  const sessionsDir = path.join(homeDir, '.codex', 'sessions');
  const stack = [sessionsDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(sessionId)) {
        return entryPath;
      }
    }
  }

  return undefined;
}

function resolveSessionFile(homeDir, input) {
  const explicitPath = envValue([
    'CODEX_SESSION_FILE',
    'CODEX_SESSION_FILE_PATH',
    'CODEX_TRANSCRIPT_PATH',
    'OPENAI_CODEX_SESSION_FILE',
    'OPENAI_CODEX_SESSION_FILE_PATH',
  ]) || nestedValue(input, [
    'session_file',
    'sessionFile',
    'session_file_path',
    'sessionFilePath',
    'transcript_path',
    'transcriptPath',
  ]);

  if (explicitPath) return explicitPath;

  const sessionId = envValue([
    'CODEX_THREAD_ID',
    'CODEX_SESSION_ID',
    'OPENAI_CODEX_THREAD_ID',
    'OPENAI_CODEX_SESSION_ID',
  ]) || nestedValue(input, [
    'session_id',
    'sessionId',
    'thread_id',
    'threadId',
    'conversation_id',
    'conversationId',
  ]);

  return sessionId ? findSessionFileById(homeDir, sessionId) : undefined;
}

function resolveCodexPid(input) {
  const pid = envValue([
    'CODEX_PID',
    'CODEX_PROCESS_PID',
    'OPENAI_CODEX_PID',
    'OPENAI_CODEX_PROCESS_PID',
    'AI_DEVKIT_CODEX_PID',
  ]) || nestedValue(input, [
    'codex_pid',
    'codexPid',
    'codex_process_pid',
    'codexProcessPid',
    'pid',
  ]);

  return pid || String(process.ppid || process.pid);
}

const input = readHookInput();
const homeDir = os.homedir();
const registryFile = path.join(homeDir, '.codex', 'ai-devkit', 'sessions.json');
const existing = readJson(registryFile, {});
const registry = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};

registry[resolveCodexPid(input)] = resolveSessionFile(homeDir, input) || 'ephemeral';

fs.mkdirSync(path.dirname(registryFile), { recursive: true });
fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2), 'utf8');
