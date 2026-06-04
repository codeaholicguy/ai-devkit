import { execFileSync } from 'child_process';

describe('SWC build output', () => {
  it('runs the emitted CLI entrypoint with JSON imports preserved', () => {
    const packageRoot = new URL('../../../', import.meta.url);

    execFileSync('npm', ['run', 'build'], {
      cwd: packageRoot,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1'
      },
      stdio: 'pipe'
    });

    const output = execFileSync(process.execPath, ['dist/cli.js', '--version'], {
      cwd: packageRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    expect(output.trim()).toBe('0.38.0');
  });
});
