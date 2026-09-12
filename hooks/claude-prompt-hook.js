#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SESSION_ID_KEYS = ['session_id', 'sessionId'];
const TOOL_NAME_KEYS = ['tool_name', 'toolName'];
const TOOL_INPUT_KEYS = ['tool_input', 'toolInput'];

function readStdin() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function sanitizeSessionId(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/[^a-zA-Z0-9\-]/g, '');
  return clean.length > 0 ? clean : null;
}

const input = readStdin();
const rawSessionId = pick(input, SESSION_ID_KEYS) ?? process.env.CLAUDE_SESSION_ID;
const sessionId = sanitizeSessionId(rawSessionId);

if (!sessionId) {
  process.exit(0);
}

const toolName = String(pick(input, TOOL_NAME_KEYS) ?? '');
const toolInput = pick(input, TOOL_INPUT_KEYS) ?? {};

const entry = {
  sessionId,
  toolName,
  toolInput,
  timestamp: new Date().toISOString(),
};

try {
  const promptsDir = path.join(os.homedir(), '.ai-devkit', 'agent-requests');
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(path.join(promptsDir, `${sessionId}.json`), JSON.stringify(entry, null, 2), 'utf8');
} catch {
  // Never disrupt Claude Code
}

process.exit(0);
