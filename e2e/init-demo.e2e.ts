import { join } from 'path';

// Compiled service under test (dist mirrors src layout).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runInitDemo } = await import(
  join(__dirname, '..', 'packages', 'cli', 'dist', 'services', 'init', 'init-demo.service.js')
);

function makeExecutable(dir: string, name: string): void {
  const file = join(dir, name);
  writeFileSync(file, '#!/bin/sh\necho stub\n');
  chmodSync(file, 0o755);
}

describe('init --demo failure paths', () => {
  it('fails when tmux is missing even if harness CLIs exist', async () => {
    const code = await runInitDemo(
      { cwd: process.cwd() },
      {
        platform: 'linux',
        commandExists: (command) => {
          if (command === 'tmux') return false;
          return command === 'claude' || command === 'codex';
        },
        resolveTmuxInstall: async () => ({
          command: 'sudo apt install -y tmux',
          message: 'Install it with: sudo apt install -y tmux.',
        }),
        startAgent: async () => {
          throw new Error('should not start agents without tmux');
        },
        sendToAgent: async () => undefined,
        createManager: () => ({}) as never,
        createFocusManager: () => ({}) as never,
        ui: {
          text: () => {},
          success: () => {},
          error: () => {},
          info: () => {},
          warning: () => {},
          breakline: () => {},
        },
      },
    );

    expect(code).toBe(1);
  });

  it('fails when only one harness CLI is available', async () => {
    const code = await runInitDemo(
      { cwd: process.cwd() },
      {
        platform: 'linux',
        commandExists: (command) => command === 'tmux' || command === 'claude',
        resolveTmuxInstall: async () => ({ command: null, message: 'Install tmux.' }),
        startAgent: async () => {
          throw new Error('should not start agents with one harness');
        },
        sendToAgent: async () => undefined,
        createManager: () => ({}) as never,
        createFocusManager: () => ({}) as never,
        ui: {
          text: () => {},
          success: () => {},
          error: () => {},
          info: () => {},
          warning: () => {},
          breakline: () => {},
        },
      },
    );

    expect(code).toBe(1);
  });
});