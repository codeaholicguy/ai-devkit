import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { DaemonClient, ensureDaemon } from '@ai-devkit/daemon-client';

// Fails rather than skips without a binary: a silent skip is how #371 shipped.
const repoRoot = join(__dirname, '..');
const bin =
  process.env.DEVKITD_BIN ??
  [join(repoRoot, 'rust/target/release/devkitd'), join(repoRoot, 'rust/target/debug/devkitd')].find((p) =>
    existsSync(p)
  );
if (!bin) {
  throw new Error(
    'devkitd binary not found: run `cargo build -p devkitd --manifest-path rust/Cargo.toml` or set DEVKITD_BIN'
  );
}

describe('ensureDaemon (real binary)', () => {
  const previousBin = process.env.DEVKITD_BIN;
  const previousHome = process.env.HOME;
  // Isolated HOME: never touch the user's ~/.ai-devkit/daemon.sock.
  let tmpHome: string;

  beforeAll(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'aidk-int-home-'));
    process.env.HOME = tmpHome;
    process.env.DEVKITD_BIN = bin;
  });

  afterAll(async () => {
    const c = await DaemonClient.tryConnect();
    if (c) {
      await c.request('shutdown').catch(() => {});
      c.close();
    }
    if (previousBin === undefined) delete process.env.DEVKITD_BIN;
    else process.env.DEVKITD_BIN = previousBin;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('spawns the daemon on socket miss and returns a working client', async () => {
    const client = await ensureDaemon({ waitMs: 20000 });
    expect(client).not.toBeNull();
    const pong = (await client!.request('ping')) as { pong: boolean };
    expect(pong.pong).toBe(true);
    const agents = (await client!.request('agent.list')) as unknown[];
    expect(Array.isArray(agents)).toBe(true);
    client!.close();
  });

  it('a second ensureDaemon is a no-op fast path', async () => {
    const started = Date.now();
    const client = await ensureDaemon();
    expect(client).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
    client!.close();
  });

  it('listAgents returns the attributed list over the real socket', async () => {
    const client = await ensureDaemon({ waitMs: 20000 });
    expect(client).not.toBeNull();
    const result = await client!.listAgents();
    // The contract is a bare attributed array, empty or not.
    expect(Array.isArray(result)).toBe(true);
    client!.close();
  });

  it('startAgent surfaces coded daemon errors', async () => {
    // A fresh isolated HOME guarantees a devkitd at the current build.
    const suiteHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'aidk-home-'));
    process.env.HOME = home;
    try {
      const client = await ensureDaemon({ waitMs: 20000 });
      expect(client).not.toBeNull();
      // Unknown harness type → harness_not_startable (no spawn attempted).
      await expect(client!.startAgent({ type: 'nonsense', cwd: '/' })).rejects.toMatchObject({
        code: 'harness_not_startable'
      });
      // Bad name → invalid_params before anything spawns.
      await expect(client!.startAgent({ type: 'claude', name: 'BAD NAME', cwd: '/' })).rejects.toMatchObject({
        code: 'invalid_params'
      });
      await client!.request('shutdown').catch(() => {});
      client!.close();
    } finally {
      process.env.HOME = suiteHome;
      rmSync(home, { recursive: true, force: true });
    }
  });
});

/**
 * Issue #371 regression coverage at the daemon boundary: a stub `ps` on
 * PATH feeds devkitd synthetic procps output with PADDED columns — the
 * exact shape that used to make every row unparseable, leaving
 * `agent.list` permanently empty.
 */
describe('devkitd sweep with stub ps', () => {
  let home: string;
  let sock: string;
  let daemon: ChildProcess | null = null;

  const PADDED_PS = '  424242   1 pts/1    claude\n 424243 424242 pts/2    gemini\n';

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'devkitd-ps-e2e-'));
    const stubDir = join(home, 'stub-bin');
    mkdirSync(stubDir);
    const stub = join(stubDir, 'ps');
    writeFileSync(stub, `#!/bin/sh\nprintf '%s' '${PADDED_PS}'\n`);
    chmodSync(stub, 0o755);

    sock = join(home, '.ai-devkit', 'daemon.sock');
    daemon = spawn(bin, ['serve'], {
      env: {
        ...process.env,
        HOME: home,
        PATH: `${stubDir}${delimiter}${process.env.PATH}`,
        RUST_LOG: 'warn'
      },
      stdio: 'ignore'
    });
    daemon.unref();

    const deadline = Date.now() + 10_000;
    while (!existsSync(sock)) {
      if (daemon.exitCode !== null) throw new Error('devkitd exited before binding its socket');
      if (Date.now() > deadline) throw new Error('timed out waiting for daemon socket');
      await new Promise((r) => setTimeout(r, 50));
    }
  }, 15_000);

  afterAll(async () => {
    if (daemon) {
      const c = await DaemonClient.tryConnect(sock).catch(() => null);
      if (c) {
        await c.request('shutdown').catch(() => {});
        c.close();
      }
      daemon.kill('SIGKILL');
    }
    rmSync(home, { recursive: true, force: true });
  });

  it('agent.list reports agents from padded procps rows', async () => {
    const client = await DaemonClient.connect(sock);
    try {
      const agents = await client.listAgents();
      const pids = agents.map((a) => a.pid);
      expect(pids).toContain(424242);
      expect(agents.find((a) => a.pid === 424242)?.type).toBe('claude');
    } finally {
      client.close();
    }
  });
});
