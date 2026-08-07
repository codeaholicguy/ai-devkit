#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('fake-claude 2.1.220\n');
  process.exit(0);
}
if (args[0] === '--help') {
  process.stdout.write('--print -p --session-id --resume --output-format stream-json --verbose\n');
  process.exit(0);
}

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const flag = args.includes('--session-id') ? '--session-id' : '--resume';
  const sessionId = args[args.indexOf(flag) + 1];
  const capture = process.env.AI_DEVKIT_FAKE_CLAUDE_CAPTURE;
  if (capture) fs.appendFileSync(capture, `${JSON.stringify({ args, prompt, cwd: process.cwd() })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'result', session_id: sessionId, result: `answer:${prompt}` })}\n`);
});
