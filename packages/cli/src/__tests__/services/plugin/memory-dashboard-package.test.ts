import fs from 'fs-extra';
import path from 'path';

describe('memory dashboard plugin package', () => {
  it('declares the memory-dashboard plugin command manifest', async () => {
    const packageJsonPath = path.resolve(
      process.cwd(),
      '../../packages/memory-dashboard/package.json'
    );
    const packageJson = await fs.readJson(packageJsonPath) as unknown;
    const aiDevkit = (packageJson as { aiDevkit?: { commands?: unknown } }).aiDevkit;

    expect((packageJson as { name?: string }).name).toBe('@ai-devkit/memory-dashboard');
    expect(aiDevkit?.commands).toEqual([
      {
        name: 'memory-dashboard',
        description: 'Launch the local AI DevKit memory dashboard',
        entry: './dist/command.js',
      },
    ]);
  });
});
