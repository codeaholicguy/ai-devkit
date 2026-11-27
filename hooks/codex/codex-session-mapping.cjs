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

const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = Number(process.env.AI_DEVKIT_SESSION_REGISTRY_LOCK_WAIT_MS) || 10_000;

function registryWarn(message) {
  console.warn(message);
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function tryAcquireLock(lockPath, staleMs) {
  try {
    fs.closeSync(fs.openSync(lockPath, 'wx', 0o600));
    return true;
  } catch {
    try {
      const age = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (age > staleMs) {
        fs.unlinkSync(lockPath);
        fs.closeSync(fs.openSync(lockPath, 'wx', 0o600));
        return true;
      }
    } catch {
      /* races with the holder are fine — losing means we wait */
    }
    return false;
  }
}

function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* already gone */
  }
}

function withRegistryLock(registryFile, fn) {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  const lockPath = `${registryFile}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    if (tryAcquireLock(lockPath, STALE_LOCK_MS)) {
      try {
        fn();
        return true;
      } finally {
        releaseLock(lockPath);
      }
    }
    sleepMs(LOCK_RETRY_MS);
  }
  registryWarn(
    `ai-devkit: timed out acquiring lock for ${registryFile}; skipping this registry update`,
  );
  return false;
}

function readRegistryForUpdate(registryFile) {
  let raw;

  try {
    raw = fs.readFileSync(registryFile, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return {};
    throw e;
  }

  try {
    const existing = JSON.parse(raw);
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) return existing;
    throw new Error('sessions.json is not a JSON object');
  } catch (e) {
    if (e.message === 'sessions.json is not a JSON object') throw e;
    throw new Error('sessions.json is not valid JSON');
  }
}

function loadRegistryForUpdate(registryFile) {
  try {
    return readRegistryForUpdate(registryFile);
  } catch (e) {
    if (
      e.message !== 'sessions.json is not valid JSON' &&
      e.message !== 'sessions.json is not a JSON object'
    ) {
      throw e;
    }
    if (!fs.existsSync(registryFile)) return {};
    const corruptPath = `${registryFile}.corrupt-${Date.now()}`;
    fs.renameSync(registryFile, corruptPath);
    registryWarn(
      `ai-devkit: sessions registry at ${registryFile} was unreadable; renamed to ${corruptPath} and starting fresh`,
    );
    return {};
  }
}

function writeRegistry(registryFile, registry) {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  const tmp = `${registryFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8');
  fs.renameSync(tmp, registryFile);
}

function updateRegistry(registryFile, mutator) {
  return withRegistryLock(registryFile, () => {
    const registry = loadRegistryForUpdate(registryFile);
    mutator(registry);
    writeRegistry(registryFile, registry);
  });
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
const codexPid = resolveCodexPid(input);
const sessionFile = resolveSessionFile(homeDir, input) || 'ephemeral';

updateRegistry(registryFile, (registry) => {
  registry[codexPid] = sessionFile;
});
