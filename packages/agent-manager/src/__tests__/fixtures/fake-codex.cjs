#!/usr/bin/env node
const fs = require('node:fs');

const SESSION = '22222222-2222-4222-8222-222222222222';
const MISMATCH = '33333333-3333-4333-8333-333333333333';
const args = process.argv.slice(2);

if (args[0] === '--version') {
  process.stdout.write('codex-cli 0.147.0\n');
  process.exit(0);
}
if (args[0] === 'exec' && args.at(-1) === '--help') {
  process.stdout.write(args[1] === 'resume'
    ? 'Usage: codex exec resume [SESSION_ID] [PROMPT]\n--json\n- stdin\n'
    : 'Usage: codex exec [PROMPT]\nresume\n--json\n- stdin\n');
  process.exit(0);
}

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const mode = process.env.AI_DEVKIT_FAKE_CODEX_MODE || 'success';
  const isResume = args[1] === 'resume';
  const requested = isResume ? args[3] : null;
  const sessionId = mode === 'mismatch' ? MISMATCH : (requested || SESSION);
  const capture = process.env.AI_DEVKIT_FAKE_CODEX_CAPTURE;
  if (capture) fs.appendFileSync(capture, `${JSON.stringify({ args, prompt, cwd: process.cwd() })}\n`);
  if (mode === 'fail-before-bind') process.exit(1);
  if (mode !== 'missing-thread') process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: sessionId })}\n`);
  if (mode === 'fail-after-bind') process.exit(1);
  if (mode === 'malformed') return process.stdout.write('{bad\n');
  if (mode === 'oversized') return process.stdout.write(`${'x'.repeat(1024 * 1024 + 1)}\n`);
  if (mode === 'truncated') return process.stdout.write('{');
  process.stdout.write(`${JSON.stringify({ type: 'turn.started' })}\n`);
  if (mode !== 'missing-result') {
    process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'first' } })}\n`);
    process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: `answer:${prompt}` } })}\n`);
  }
  if (mode !== 'missing-completion') process.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: {} })}\n`);
  if (mode === 'stderr-failure') {
    process.stderr.write('secret-looking diagnostic');
    process.exitCode = 1;
  }
});
