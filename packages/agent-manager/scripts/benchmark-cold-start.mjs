#!/usr/bin/env node
/**
 * Cold-start session summary benchmark (issue #261).
 *
 * Generates synthetic transcripts under os.tmpdir(), measures them against
 * the built package in dist/, and deletes them afterwards:
 *
 * 1. First summary of one large Claude transcript (default 400 MB):
 *    bytes read and wall time of a cold `readSessionIncremental`.
 * 2. Cold `listAgents()` over N agents (default 30, half Claude, half Codex)
 *    with ~1 GB of transcripts in total, run in a fresh child process to
 *    report wall time and peak RSS.
 *
 * To keep disk use to one transcript at a time, the listAgents fixture
 * hard-links one transcript per provider under N session paths; each path is
 * still summarised independently.
 *
 * Usage (after `npm run build`):
 *   node scripts/benchmark-cold-start.mjs [--size-mb=400] [--agents=30] [--total-mb=1024]
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import { createRequire, syncBuiltinESMExports } from "module";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");
const MiB = 1024 * 1024;

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value] = arg.slice(2).split("=");
      return [key, value ?? "true"];
    }),
);

if (args["list-child"]) {
  await runListChild(args["list-child"], Number(args.agents));
} else {
  await main();
}

async function main() {
  const sizeMb = Number(args["size-mb"] ?? 400);
  const agents = Number(args.agents ?? 30);
  const totalMb = Number(args["total-mb"] ?? 1024);

  console.log(`Free disk (tmpdir): ${freeDiskMb()} MB`);
  await benchmarkSingleFile(sizeMb);
  benchmarkListAgents(agents, totalMb);
}

/** Count bytes returned by fs.readSync / fs.readFileSync (as seen by ESM importers). */
function instrumentReads() {
  const require = createRequire(import.meta.url);
  const cjsFs = require("fs");
  const counter = { bytes: 0 };
  const readSync = cjsFs.readSync;
  const readFileSync = cjsFs.readFileSync;
  cjsFs.readSync = function (...callArgs) {
    const n = readSync.apply(this, callArgs);
    counter.bytes += n;
    return n;
  };
  cjsFs.readFileSync = function (...callArgs) {
    const out = readFileSync.apply(this, callArgs);
    counter.bytes += typeof out === "string" ? Buffer.byteLength(out) : out.length;
    return out;
  };
  syncBuiltinESMExports();
  return counter;
}

async function benchmarkSingleFile(sizeMb) {
  const counter = instrumentReads();
  const { ClaudeSessionParser } = await import(
    path.join(dist, "providers", "claude", "ClaudeSessionParser.js")
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-devkit-cold-start-"));
  const filePath = path.join(dir, "11111111-2222-3333-4444-555555555555.jsonl");
  try {
    writeClaudeTranscript(filePath, sizeMb * MiB);
    const size = fs.statSync(filePath).size;

    const timings = [];
    let bytes = 0;
    let session;
    for (let run = 0; run < 5; run++) {
      const parser = new ClaudeSessionParser();
      counter.bytes = 0;
      const start = process.hrtime.bigint();
      session = parser.readSessionIncremental(filePath, "");
      timings.push(Number(process.hrtime.bigint() - start) / 1e6);
      bytes = counter.bytes;
    }

    const full = new ClaudeSessionParser({ summaryBounds: false });
    counter.bytes = 0;
    const fullStart = process.hrtime.bigint();
    const fullSession = full.readSessionIncremental(filePath, "");
    const fullMs = Number(process.hrtime.bigint() - fullStart) / 1e6;

    console.log(`\n[1] First summary of a ${(size / MiB).toFixed(0)} MiB Claude transcript`);
    console.log(`  bounded: read ${(bytes / MiB).toFixed(2)} MiB, ${fmtTimings(timings)}`);
    console.log(
      `  full parse (bounds: false): read ${(counter.bytes / MiB).toFixed(0)} MiB, ${fullMs.toFixed(0)} ms`,
    );
    console.log(`  bounded summary:`, pick(session));
    console.log(`  full summary:   `, pick(fullSession));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function benchmarkListAgents(agents, totalMb) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-devkit-cold-list-"));
  try {
    const perFile = Math.floor((totalMb * MiB) / agents);
    const claudeCount = Math.ceil(agents / 2);
    const codexCount = agents - claudeCount;
    const startTime = new Date();

    const projectDir = path.join(home, ".claude", "projects", "-repo");
    const pidDir = path.join(home, ".claude", "sessions");
    const codexDir = path.join(home, ".codex", "sessions", "2026", "09", "28");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(pidDir, { recursive: true });
    fs.mkdirSync(codexDir, { recursive: true });
    fs.mkdirSync(path.join(home, ".codex", "ai-devkit"), { recursive: true });

    const claudeSource = path.join(home, "claude-source.jsonl");
    const codexSource = path.join(home, "codex-source.jsonl");
    writeClaudeTranscript(claudeSource, perFile);
    writeCodexTranscript(codexSource, perFile, "019eabed-0000-7000-8000-000000000000");

    const processes = [];
    for (let i = 0; i < claudeCount; i++) {
      const pid = 81000 + i;
      const sessionId = `11111111-2222-3333-4444-${String(i).padStart(12, "0")}`;
      fs.linkSync(claudeSource, path.join(projectDir, `${sessionId}.jsonl`));
      fs.writeFileSync(
        path.join(pidDir, `${pid}.json`),
        JSON.stringify({
          pid,
          sessionId,
          cwd: "/repo",
          startedAt: startTime.getTime(),
          kind: "interactive",
          entrypoint: "cli",
        }),
      );
      processes.push({ pid, command: "claude", cwd: "/repo", tty: `ttys${i}`, startTime });
    }
    const mapping = {};
    for (let i = 0; i < codexCount; i++) {
      const pid = 82000 + i;
      const sessionId = `019eabed-0000-7000-8000-${String(i).padStart(12, "0")}`;
      const filePath = path.join(codexDir, `rollout-2026-09-28T00-00-00-${sessionId}.jsonl`);
      fs.linkSync(codexSource, filePath);
      mapping[pid] = filePath;
      processes.push({ pid, command: "codex", cwd: "/repo", tty: `ttys${100 + i}`, startTime });
    }
    fs.writeFileSync(
      path.join(home, ".codex", "ai-devkit", "sessions.json"),
      JSON.stringify(mapping),
    );
    fs.writeFileSync(path.join(home, "processes.json"), JSON.stringify(processes));

    const logical = agents * fs.statSync(claudeSource).size;
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), `--list-child=${home}`, `--agents=${agents}`],
      { encoding: "utf8", env: { ...process.env, HOME: home } },
    );
    console.log(
      `\n[2] Cold listAgents(): ${agents} agents, ${(logical / MiB).toFixed(0)} MiB of transcripts`,
    );
    process.stdout.write(child.stdout);
    process.stderr.write(child.stderr);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function runListChild(home, agents) {
  const { AgentManager, ClaudeCodeAdapter, CodexAdapter } = await import(
    path.join(dist, "index.js")
  );
  const { AgentRegistry } = await import(path.join(dist, "utils", "AgentRegistry.js"));
  const processes = JSON.parse(fs.readFileSync(path.join(home, "processes.json"), "utf8")).map(
    (p) => ({ ...p, startTime: new Date(p.startTime) }),
  );
  const registry = new AgentRegistry(path.join(home, "agents.json"));
  const manager = new AgentManager(registry, async () => processes);
  manager.registerAdapter(new ClaudeCodeAdapter());
  manager.registerAdapter(new CodexAdapter(registry));

  const rssBefore = process.memoryUsage().rss;
  const start = process.hrtime.bigint();
  const listed = await manager.listAgents();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const peakRss = process.resourceUsage().maxRSS * 1024;

  const warmStart = process.hrtime.bigint();
  await manager.listAgents();
  const warmMs = Number(process.hrtime.bigint() - warmStart) / 1e6;

  console.log(`  agents listed: ${listed.length}/${agents}`);
  console.log(
    `  cold listAgents: ${ms.toFixed(0)} ms (second, cached refresh: ${warmMs.toFixed(1)} ms)`,
  );
  console.log(
    `  RSS before: ${(rssBefore / MiB).toFixed(0)} MiB, peak RSS: ${(peakRss / MiB).toFixed(0)} MiB`,
  );
}

/** Realistic-ish Claude transcript: first prompt, bulky tool traffic, latest turn at the end. */
function writeClaudeTranscript(filePath, targetBytes) {
  const ts = (min) => new Date(Date.UTC(2026, 8, 28, 0, min)).toISOString();
  const head = [
    { type: "file-history-snapshot", snapshot: { timestamp: ts(0) } },
    {
      type: "user",
      timestamp: ts(0),
      cwd: "/repo",
      message: { content: "first task: refactor the parser" },
    },
  ];
  const block = [
    {
      type: "assistant",
      timestamp: ts(1),
      cwd: "/repo",
      message: {
        content: [{ type: "tool_use", name: "Read", input: { file_path: "/repo/a.ts" } }],
      },
    },
    {
      type: "user",
      timestamp: ts(1),
      cwd: "/repo",
      message: { content: [{ type: "tool_result", content: "x".repeat(48 * 1024) }] },
    },
    { type: "progress", timestamp: ts(2) },
    {
      type: "assistant",
      timestamp: ts(2),
      cwd: "/repo",
      message: { content: [{ type: "text", text: "y".repeat(4096) }] },
    },
    {
      type: "user",
      timestamp: ts(3),
      cwd: "/repo",
      message: { content: "please continue with the next file" },
    },
  ];
  const tail = [
    {
      type: "user",
      timestamp: ts(58),
      cwd: "/repo",
      message: { content: "latest task: write the benchmark" },
    },
    {
      type: "assistant",
      timestamp: ts(59),
      cwd: "/repo",
      message: { content: [{ type: "text", text: "done" }] },
    },
  ];
  writeTranscript(filePath, targetBytes, head, block, tail);
}

function writeCodexTranscript(filePath, targetBytes, sessionId) {
  const ts = (min) => new Date(Date.UTC(2026, 8, 28, 0, min)).toISOString();
  const head = [
    {
      type: "session_meta",
      payload: {
        id: sessionId,
        cwd: "/repo",
        timestamp: ts(0),
        base_instructions: { text: "i".repeat(20_000) },
      },
    },
  ];
  const block = [
    {
      type: "response_item",
      timestamp: ts(1),
      payload: { type: "function_call_output", output: "o".repeat(48 * 1024) },
    },
    { type: "event_msg", timestamp: ts(2), payload: { type: "agent_message", message: "working" } },
  ];
  const tail = [
    {
      type: "event_msg",
      timestamp: ts(59),
      payload: { type: "task_complete", message: "latest codex result" },
    },
  ];
  writeTranscript(filePath, targetBytes, head, block, tail);
}

function writeTranscript(filePath, targetBytes, head, block, tail) {
  const toJsonl = (entries) => entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
  const blockBuf = Buffer.from(toJsonl(block).repeat(16));
  const headBuf = Buffer.from(toJsonl(head));
  const tailBuf = Buffer.from(toJsonl(tail));
  const fd = fs.openSync(filePath, "w");
  try {
    fs.writeSync(fd, headBuf);
    let written = headBuf.length;
    while (written + blockBuf.length + tailBuf.length <= targetBytes) {
      fs.writeSync(fd, blockBuf);
      written += blockBuf.length;
    }
    fs.writeSync(fd, tailBuf);
  } finally {
    fs.closeSync(fd);
  }
}

function pick(session) {
  if (!session) return session;
  const { firstUserMessage, lastUserMessage, lastEntryType, lastActive, sessionStart } = session;
  return { firstUserMessage, lastUserMessage, lastEntryType, lastActive, sessionStart };
}

function fmtTimings(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  return `min ${sorted[0].toFixed(1)} ms, median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms (${timings.length} cold runs)`;
}

function freeDiskMb() {
  try {
    const stats = fs.statfsSync(os.tmpdir());
    return Math.floor((stats.bavail * stats.bsize) / MiB);
  } catch {
    return "unknown";
  }
}
