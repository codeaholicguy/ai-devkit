#!/usr/bin/env node

import pkg from '../package.json' with { type: 'json' };

const { version } = pkg as { version: string };
const args = process.argv.slice(2);

if (args[0] === '--version' || args[0] === '-V') {
  process.stdout.write(`${version}\n`);
} else {
  const { resolveLightweightCliResponse, runSelectedCommand } = await import('./cli-runtime.js');
  const response = resolveLightweightCliResponse(args, version);

  if (!response.handled) {
    await runSelectedCommand(process.argv, version);
  }

  process.stdout.write(response.output ?? '');
}
