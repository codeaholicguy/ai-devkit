const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SESSION_FILE_ENV_KEYS = [
  'CODEX_SESSION_FILE',
  'CODEX_SESSION_FILE_PATH',
  'CODEX_TRANSCRIPT_PATH',
  'OPENAI_CODEX_SESSION_FILE',
  'OPENAI_CODEX_SESSION_FILE_PATH',
];

const SESSION_FILE_INPUT_KEYS = [
  'session_file',
  'sessionFile',
  'session_file_path',
  'sessionFilePath',
  'transcript_path',
  'transcriptPath',
];

const SESSION_ID_ENV_KEYS = [
  'CODEX_THREAD_ID',
  'CODEX_SESSION_ID',
  'OPENAI_CODEX_THREAD_ID',
  'OPENAI_CODEX_SESSION_ID',
];

const SESSION_ID_INPUT_KEYS = [
  'session_id',
  'sessionId',
  'thread_id',
  'threadId',
  'conversation_id',
  'conversationId',
];

const CODEX_PID_ENV_KEYS = [
  'CODEX_PID',
  'CODEX_PROCESS_PID',
  'OPENAI_CODEX_PID',
  'OPENAI_CODEX_PROCESS_PID',
  'AI_DEVKIT_CODEX_PID',
];

const CODEX_PID_INPUT_KEYS = [
  'codex_pid',
  'codexPid',
  'codex_process_pid',
  'codexProcessPid',
  'pid',
];

function readHookInput() {
  if (process.stdin.isTTY) return {};

  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function normalizeValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return undefined;
}

function inputSources(input) {
  return [input, input?.payload, input?.session, input?.thread].filter(
    (source) => source && typeof source === 'object',
  );
}

function inputValue(input, keys) {
  for (const source of inputSources(input)) {
    const value = firstValue(keys, (key) => source[key]);
    if (value) return value;
  }

  return undefined;
}

function envValue(keys) {
  return firstValue(keys, (key) => process.env[key]);
}

function firstValue(keys, getValue) {
  for (const key of keys) {
    const value = normalizeValue(getValue(key));
    if (value) return value;
  }

  return undefined;
}

function readRegistry(registryFile) {
  let existing;

  try {
    existing = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  } catch {
    return {};
  }

  return existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
}

function writeRegistry(registryFile, registry) {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2), 'utf8');
}

function findSessionFileById(homeDir, sessionId) {
  const codexSessionsDir = path.join(homeDir, '.codex', 'sessions');
  const pendingDirs = [codexSessionsDir];

  while (pendingDirs.length > 0) {
    const dir = pendingDirs.pop();
    let entries;

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(sessionId)) {
        return entryPath;
      }
    }
  }

  return undefined;
}

function resolveSessionFile(homeDir, input) {
  const explicitPath = envValue(SESSION_FILE_ENV_KEYS) || inputValue(input, SESSION_FILE_INPUT_KEYS);

  if (explicitPath) return explicitPath;

  const sessionId = envValue(SESSION_ID_ENV_KEYS) || inputValue(input, SESSION_ID_INPUT_KEYS);

  return sessionId ? findSessionFileById(homeDir, sessionId) : undefined;
}

function resolveCodexPid(input) {
  const pid = envValue(CODEX_PID_ENV_KEYS) || inputValue(input, CODEX_PID_INPUT_KEYS);

  return pid || String(process.ppid || process.pid);
}

const input = readHookInput();
const homeDir = os.homedir();
const registryFile = path.join(homeDir, '.codex', 'ai-devkit', 'sessions.json');
const registry = readRegistry(registryFile);

registry[resolveCodexPid(input)] = resolveSessionFile(homeDir, input) || 'ephemeral';
writeRegistry(registryFile, registry);
