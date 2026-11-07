import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { run, createTempProject, cleanupTempProject, writeConfigFile } from './helpers';

const FIXTURE_SKILLS = ['alpha-review', 'beta-format', 'gamma-test'] as const;

/** A deterministic local `file://` registry with 3 fixture skills. */
function createFixtureRegistry(projectDir: string): string {
  const registryDir = join(projectDir, 'local-registry');
  for (const skillName of FIXTURE_SKILLS) {
    const skillDir = join(registryDir, 'skills', skillName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\ndescription: ${skillName} fixture\n---\n\n# ${skillName}\n`,
    );
  }
  return registryDir;
}

function readConfig(projectDir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(projectDir, '.ai-devkit.json'), 'utf8'));
}

function readJsonOutput(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf('{');
  expect(start).toBeGreaterThanOrEqual(0);
  return JSON.parse(stdout.slice(start));
}

describe('skill add --all (issue #424)', () => {
  let projectDir: string;
  let homeDir: string;

  const registerRegistry = () =>
    run('skill add-registry local/all ./local-registry', {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

  const addAll = (extraArgs = '') =>
    run(`skill add local/all --all ${extraArgs}`.trim(), {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

  beforeEach(() => {
    projectDir = createTempProject();
    homeDir = join(projectDir, 'home');
    mkdirSync(homeDir, { recursive: true });
    createFixtureRegistry(projectDir);
    writeConfigFile(projectDir, {
      version: '1.0.0',
      environments: ['claude'],
      phases: [],
      createdAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  it('installs every skill in the registry (3 installs)', () => {
    expect(registerRegistry().exitCode).toBe(0);

    const result = addAll();

    expect(result.exitCode).toBe(0);
    for (const skillName of FIXTURE_SKILLS) {
      expect(existsSync(join(projectDir, '.claude', 'skills', skillName, 'SKILL.md'))).toBe(true);
    }
    const config = readConfig(projectDir);
    expect((config.skills as Array<{ name: string }>).map((skill) => skill.name).sort()).toEqual(
      [...FIXTURE_SKILLS].sort(),
    );
    expect(result.stdout).toContain('3 installed');
  });

  it('is idempotent: rerun skips and counts all 3 without errors', () => {
    expect(registerRegistry().exitCode).toBe(0);
    expect(addAll().exitCode).toBe(0);

    const rerun = addAll('--json');

    expect(rerun.exitCode).toBe(0);
    const parsed = readJsonOutput(rerun.stdout) as {
      installed: number;
      skipped: number;
      failed: number;
      items: Array<{ skill: string; status: string }>;
    };
    expect(parsed.installed).toBe(0);
    expect(parsed.skipped).toBe(3);
    expect(parsed.failed).toBe(0);
    expect(parsed.items.every((item) => item.status === 'skipped')).toBe(true);
  });

  it('installs only non-excluded skills with --exclude (2 installs)', () => {
    expect(registerRegistry().exitCode).toBe(0);

    const result = addAll('--exclude "alpha-*"');

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'beta-format', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'gamma-test', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'alpha-review'))).toBe(false);
    const config = readConfig(projectDir);
    expect((config.skills as Array<{ name: string }>).map((skill) => skill.name).sort()).toEqual([
      'beta-format',
      'gamma-test',
    ]);
  });

  it('installs nothing with --dry-run (0 installs)', () => {
    expect(registerRegistry().exitCode).toBe(0);

    const result = addAll('--dry-run');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Dry run');
    expect(result.stdout).toContain('would install 3 skills');
    expect(existsSync(join(projectDir, '.claude', 'skills'))).toBe(false);
    expect(readConfig(projectDir).skills).toBeUndefined();
  });

  it('emits a machine-readable result list with --json', () => {
    expect(registerRegistry().exitCode).toBe(0);

    const result = addAll('--json');

    expect(result.exitCode).toBe(0);
    const parsed = readJsonOutput(result.stdout) as {
      registryId: string;
      dryRun: boolean;
      total: number;
      installed: number;
      skipped: number;
      failed: number;
      items: Array<{ skill: string; status: string; error?: string }>;
    };
    expect(parsed.registryId).toBe('local/all');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.total).toBe(3);
    expect(parsed.installed).toBe(3);
    expect(parsed.skipped).toBe(0);
    expect(parsed.failed).toBe(0);
    expect(parsed.items.map((item) => item.skill).sort()).toEqual([...FIXTURE_SKILLS].sort());
    expect(parsed.items.every((item) => item.status === 'installed')).toBe(true);
  });

  it('rejects --all combined with a positional skill name', () => {
    expect(registerRegistry().exitCode).toBe(0);

    const result = run('skill add local/all alpha-review --all', {
      cwd: projectDir,
      env: { HOME: homeDir },
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      '--all cannot be combined with a skill name',
    );
    expect(existsSync(join(projectDir, '.claude', 'skills'))).toBe(false);
  });
});
