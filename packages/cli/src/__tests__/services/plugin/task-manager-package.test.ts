import fs from 'fs-extra';
import path from 'path';

describe('task manager plugin package', () => {
  it('declares the task plugin command manifest', async () => {
    const packageJsonPath = path.resolve(
      process.cwd(),
      '../../packages/task-manager/package.json'
    );
    const packageJson = await fs.readJson(packageJsonPath) as unknown;
    const aiDevkit = (packageJson as { aiDevkit?: { commands?: unknown } }).aiDevkit;

    expect((packageJson as { name?: string }).name).toBe('@ai-devkit/task-manager');
    expect(aiDevkit?.commands).toEqual([
      {
        name: 'task',
        description: 'Manage durable development/debug tasks',
        entry: './dist/command.js',
      },
    ]);
  });
});
