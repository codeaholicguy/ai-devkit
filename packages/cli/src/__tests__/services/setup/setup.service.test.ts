import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createSetupService } from '../../../services/setup/setup.service.js';

describe('setup service', () => {
  let homeDir: string;
  let assetRoot: string;
  let commands: Array<{ command: string; args: string[] }>;
  let builtInSkillInstalls: string[];

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ai-devkit-setup-home-'));
    assetRoot = mkdtempSync(join(tmpdir(), 'ai-devkit-setup-assets-'));
    commands = [];
    builtInSkillInstalls = [];
    writeCodexAssets();
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(assetRoot, { recursive: true, force: true });
  });

  it('skips Codex setup when ~/.codex does not exist', async () => {
    const service = createService();

    const report = await service.run();

    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'codex',
      step: 'setup',
      status: 'skipped',
      message: '~/.codex does not exist.',
    }));
    expect(existsSync(join(homeDir, '.codex', 'hooks.json'))).toBe(false);
    expect(builtInSkillInstalls).toEqual([]);
  });

  it('copies the Codex session mapping script and merges the SessionStart hook', async () => {
    fsMkdir(join(homeDir, '.codex'));
    writeFileSync(join(homeDir, '.codex', 'hooks.json'), JSON.stringify({
      hooks: {
        SessionStart: [
          {
            matcher: 'existing',
            hooks: [{ type: 'command', command: 'echo existing' }],
          },
        ],
        Stop: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'echo stop' }],
          },
        ],
      },
    }));

    const service = createService();

    const report = await service.run({ agents: ['codex'] });

    const hooksJson = JSON.parse(readFileSync(join(homeDir, '.codex', 'hooks.json'), 'utf-8'));
    expect(readFileSync(join(homeDir, '.codex', 'hooks', 'codex-session-mapping.cjs'), 'utf-8')).toBe('module.exports = {};');
    expect(hooksJson.hooks.Stop).toHaveLength(1);
    expect(hooksJson.hooks.SessionStart).toHaveLength(2);
    expect(hooksJson.hooks.SessionStart[1]).toMatchObject({
      matcher: 'startup|resume|clear|compact',
    });
    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'codex',
      step: 'codex-session-hook',
      status: 'installed',
    }));
  });

  it('does not duplicate the Codex SessionStart hook when setup is rerun', async () => {
    fsMkdir(join(homeDir, '.codex'));

    const service = createService();

    await service.run({ agents: ['codex'] });
    const report = await service.run({ agents: ['codex'] });

    const hooksJson = JSON.parse(readFileSync(join(homeDir, '.codex', 'hooks.json'), 'utf-8'));
    expect(hooksJson.hooks.SessionStart).toHaveLength(1);
    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'codex',
      step: 'codex-session-hook',
      status: 'skipped',
    }));
  });

  it('records a failed Codex setup step when hook assets are invalid', async () => {
    fsMkdir(join(homeDir, '.codex'));
    writeFileSync(join(assetRoot, 'codex', 'hooks.json'), JSON.stringify({ hooks: {} }));

    const report = await createService().run({ agents: ['codex'] });

    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'codex',
      step: 'codex-session-hook',
      status: 'failed',
      message: 'Codex hook asset does not include a SessionStart entry.',
    }));
  });

  it('installs built-in skills for Codex when ~/.codex exists', async () => {
    fsMkdir(join(homeDir, '.codex'));

    const report = await createService().run({ agents: ['codex'] });

    expect(builtInSkillInstalls).toEqual(['codex']);
    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'codex',
      step: 'built-in-skills',
      status: 'installed',
    }));
  });

  it('installs the Pi session tracker when ~/.pi exists', async () => {
    fsMkdir(join(homeDir, '.pi'));
    const service = createService();

    const report = await service.run({ agents: ['pi'] });

    expect(commands).toEqual([
      { command: 'pi', args: ['install', 'npm:@ai-devkit/pi-session-tracker'] },
    ]);
    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'pi',
      step: 'pi-session-tracker',
      status: 'installed',
    }));
    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'pi',
      step: 'built-in-skills',
      status: 'installed',
    }));
    expect(builtInSkillInstalls).toEqual(['pi']);
  });

  it('skips Pi setup when ~/.pi does not exist', async () => {
    const service = createService();

    const report = await service.run({ agents: ['pi'] });

    expect(commands).toEqual([]);
    expect(report.results).toContainEqual(expect.objectContaining({
      agent: 'pi',
      step: 'setup',
      status: 'skipped',
      message: '~/.pi does not exist.',
    }));
    expect(builtInSkillInstalls).toEqual([]);
  });

  function createService() {
    return createSetupService({
      homeDir,
      assetRoot,
      runCommand: async (command, args) => {
        commands.push({ command, args });
      },
      installBuiltInSkills: async (agent) => {
        builtInSkillInstalls.push(agent);
      },
    });
  }

  function writeCodexAssets(): void {
    const codexAssetDir = join(assetRoot, 'codex');
    rmSync(codexAssetDir, { recursive: true, force: true });
    writeFileSync(join(assetRoot, '.keep'), '');
    fsMkdir(codexAssetDir);
    writeFileSync(join(codexAssetDir, 'codex-session-mapping.cjs'), 'module.exports = {};');
    writeFileSync(join(codexAssetDir, 'hooks.json'), JSON.stringify({
      hooks: {
        SessionStart: [
          {
            matcher: 'startup|resume|clear|compact',
            hooks: [
              {
                type: 'command',
                command: 'node ~/.codex/hooks/codex-session-mapping.cjs',
                timeout: 5,
              },
            ],
          },
        ],
      },
    }));
  }
});

function fsMkdir(path: string): void {
  mkdirSync(path, { recursive: true });
}
