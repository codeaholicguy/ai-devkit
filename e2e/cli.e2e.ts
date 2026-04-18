import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { run, createTempProject, cleanupTempProject, writeConfigFile } from './helpers';

describe('CLI basics', () => {
  it('should print version', () => {
    const result = run('--version');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should print help', () => {
    const result = run('--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ai-devkit');
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('lint');
    expect(result.stdout).toContain('memory');
    expect(result.stdout).toContain('skill');
    expect(result.stdout).toContain('phase');
  });

  it('should exit with error for unknown command', () => {
    const result = run('nonexistent-command');
    expect(result.exitCode).not.toBe(0);
  });
});

describe('init command', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  it('should initialize with environment and all phases', () => {
    const result = run('init -e claude --all', { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('AI DevKit initialized successfully');

    // Config file should exist
    const configPath = join(projectDir, '.ai-devkit.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.environments).toContain('claude');
    expect(config.phases).toEqual(
      expect.arrayContaining(['requirements', 'design', 'planning', 'implementation', 'testing', 'deployment', 'monitoring'])
    );
  });

  it('should initialize with specific phases', () => {
    const result = run('init -e cursor -p requirements,design', { cwd: projectDir });
    expect(result.exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(projectDir, '.ai-devkit.json'), 'utf-8'));
    expect(config.environments).toContain('cursor');
    expect(config.phases).toContain('requirements');
    expect(config.phases).toContain('design');
    expect(config.phases).not.toContain('monitoring');
  });

  it('should create phase template files in docs/ai', () => {
    run('init -e claude -p requirements,planning', { cwd: projectDir });

    expect(existsSync(join(projectDir, 'docs', 'ai', 'requirements', 'README.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'docs', 'ai', 'planning', 'README.md'))).toBe(true);
  });

  it('should support custom docs directory', () => {
    run('init -e claude -p requirements -d custom/docs', { cwd: projectDir });

    expect(existsSync(join(projectDir, 'custom', 'docs', 'requirements', 'README.md'))).toBe(true);
  });

  it('should create environment config files', () => {
    run('init -e claude --all', { cwd: projectDir });

    // Claude environment creates .claude/commands/ directory
    expect(existsSync(join(projectDir, '.claude', 'commands'))).toBe(true);
  });

  it('should initialize with template file', () => {
    const templatePath = join(projectDir, 'template.yaml');
    const templateContent = `environments:
  - claude
phases:
  - requirements
  - design
paths:
  docs: docs/ai
`;
    require('fs').writeFileSync(templatePath, templateContent);

    const result = run(`init -t "${templatePath}"`, { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('AI DevKit initialized successfully');
  });

  it('should save template registries to config', () => {
    const templatePath = join(projectDir, 'template.yaml');
    const templateContent = `environments:
  - claude
phases:
  - requirements
registries:
  my-org/skills: https://github.com/my-org/skills.git
`;
    require('fs').writeFileSync(templatePath, templateContent);

    const result = run(`init -t "${templatePath}"`, { cwd: projectDir });
    expect(result.exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(projectDir, '.ai-devkit.json'), 'utf-8'));
    expect(config.registries).toEqual({
      'my-org/skills': 'https://github.com/my-org/skills.git'
    });
  });
});

describe('lint command', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  it('should run lint on uninitialized project', () => {
    const result = run('lint', { cwd: projectDir });
    // Should complete (may have failures but shouldn't crash)
    expect(result.stdout).toBeDefined();
  });

  it('should run lint with --json flag', () => {
    const result = run('lint --json', { cwd: projectDir });
    const output = result.stdout.trim();
    const json = JSON.parse(output);
    expect(json).toHaveProperty('checks');
    expect(json).toHaveProperty('summary');
    expect(json).toHaveProperty('pass');
  });

  it('should lint initialized project', () => {
    run('init -e claude --all', { cwd: projectDir });
    const result = run('lint --json', { cwd: projectDir });
    const json = JSON.parse(result.stdout.trim());
    expect(json).toHaveProperty('checks');
    expect(Array.isArray(json.checks)).toBe(true);
  });

  it('should lint with feature flag', () => {
    run('init -e claude --all', { cwd: projectDir });
    const result = run('lint -f my-feature --json', { cwd: projectDir });
    const json = JSON.parse(result.stdout.trim());
    expect(json).toHaveProperty('feature');
    expect(json.feature.normalizedName).toBe('my-feature');
  });
});

describe('memory commands', () => {
  let projectDir: string;
  let uid: string;
  let projectMemoryDbPath: string;

  beforeEach(() => {
    projectDir = createTempProject();
    uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    projectMemoryDbPath = join(projectDir, '.ai-devkit', 'memory.db');
    writeConfigFile(projectDir, {
      version: '1.0.0',
      environments: [],
      phases: [],
      memory: {
        path: '.ai-devkit/memory.db'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  it('should store and search knowledge', () => {
    const title = `E2E API Design Practices ${uid}`;
    const storeResult = run(
      `memory store -t "${title}" -c "When building REST APIs always use Response DTOs instead of returning domain entities directly ref ${uid}."`,
      { cwd: projectDir }
    );
    expect(storeResult.exitCode).toBe(0);
    const stored = JSON.parse(storeResult.stdout.trim());
    expect(stored.success).toBe(true);
    expect(stored.id).toBeDefined();
    expect(existsSync(projectMemoryDbPath)).toBe(true);

    const searchResult = run(`memory search -q "${title}"`, { cwd: projectDir });
    expect(searchResult.exitCode).toBe(0);
    const searched = JSON.parse(searchResult.stdout.trim());
    expect(searched.results).toBeDefined();
    expect(searched.results.length).toBeGreaterThan(0);
  });

  it('should store with tags and scope', () => {
    const result = run(
      `memory store -t "E2E Backend Testing Strategy ${uid}" -c "Integration tests should always hit a real database rather than mocks ensuring migration issues are caught ref ${uid}." --tags "testing,backend" -s "project:e2e-${uid}"`,
      { cwd: projectDir }
    );
    expect(result.exitCode).toBe(0);
    const stored = JSON.parse(result.stdout.trim());
    expect(stored.success).toBe(true);
  });

  it('should update stored knowledge', () => {
    const storeResult = run(
      `memory store -t "E2E Deployment Checklist ${uid}" -c "Before deploying to production ensure all tests pass and database migrations are reviewed and documented ref ${uid}."`,
      { cwd: projectDir }
    );
    expect(storeResult.exitCode).toBe(0);
    const stored = JSON.parse(storeResult.stdout.trim());

    const updateResult = run(
      `memory update --id ${stored.id} -t "E2E Updated Deployment Checklist ${uid}"`,
      { cwd: projectDir }
    );
    expect(updateResult.exitCode).toBe(0);
    const updated = JSON.parse(updateResult.stdout.trim());
    expect(updated.success).toBe(true);
  });

  it('should search with --table flag', () => {
    run(
      `memory store -t "E2E Component Architecture ${uid}" -c "Use compound components pattern for complex UI elements providing better composition and reducing prop drilling ref ${uid}."`,
      { cwd: projectDir }
    );

    const result = run(`memory search -q "E2E Component Architecture ${uid}" --table`, { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('id');
    expect(result.stdout).toContain('title');
    expect(result.stdout).toContain('scope');
  });

  it('should reject invalid store input', () => {
    const result = run('memory store -t "Short" -c "Too short"', { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });

  it('should search with limit', () => {
    for (let i = 1; i <= 3; i++) {
      run(
        `memory store -t "E2E Knowledge item ${i} ${uid}" -c "This is detailed content for knowledge item number ${i} with unique identifier ${uid} to meet the minimum length."`,
        { cwd: projectDir }
      );
    }

    const result = run(`memory search -q "E2E Knowledge item ${uid}" -l 2`, { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    const searched = JSON.parse(result.stdout.trim());
    expect(searched.results.length).toBeLessThanOrEqual(2);
  });
});

describe('phase command', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
    // Initialize first
    run('init -e claude -p requirements', { cwd: projectDir });
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  it('should add a new phase', () => {
    const result = run('phase testing', { cwd: projectDir });
    expect(result.exitCode).toBe(0);

    expect(existsSync(join(projectDir, 'docs', 'ai', 'testing', 'README.md'))).toBe(true);

    const config = JSON.parse(readFileSync(join(projectDir, '.ai-devkit.json'), 'utf-8'));
    expect(config.phases).toContain('testing');
  });
});

describe('install command', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  it('should install from config file', () => {
    writeConfigFile(projectDir, {
      version: '1.0.0',
      environments: ['claude'],
      phases: ['requirements', 'design'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const result = run('install', { cwd: projectDir });
    expect(result.exitCode).toBe(0);
  });

  it('should fail with missing config file', () => {
    const result = run('install -c nonexistent.json', { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });

  it('should install when config has registries and skills', () => {
    writeConfigFile(projectDir, {
      version: '1.0.0',
      environments: ['claude'],
      phases: ['requirements'],
      registries: {
        'codeaholicguy/ai-devkit': 'https://github.com/codeaholicguy/ai-devkit.git'
      },
      skills: [
        { registry: 'codeaholicguy/ai-devkit', name: 'dev-lifecycle' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const result = run('install', { cwd: projectDir });
    expect(result.exitCode).toBe(0);
  });
});

describe('skill command', () => {
  it('should list skills (empty)', () => {
    const projectDir = createTempProject();
    run('init -e claude -p requirements', { cwd: projectDir });

    const result = run('skill list', { cwd: projectDir });
    expect(result.exitCode).toBe(0);

    cleanupTempProject(projectDir);
  });

  describe('skill remove (issue #63)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = createTempProject();
    });

    afterEach(() => {
      cleanupTempProject(projectDir);
    });

    it('should remove the skill entry from .ai-devkit.json after removal', () => {
      writeConfigFile(projectDir, {
        version: '1.0.0',
        environments: ['claude'],
        phases: [],
        skills: [
          { registry: 'codeaholicguy/ai-devkit', name: 'dev-lifecycle' }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Create the skill directory so the remove command finds it
      const skillDir = join(projectDir, '.claude', 'skills', 'dev-lifecycle');
      mkdirSync(skillDir, { recursive: true });

      const result = run('skill remove dev-lifecycle', { cwd: projectDir });
      expect(result.exitCode).toBe(0);

      // Skill directory should be gone
      expect(existsSync(skillDir)).toBe(false);

      // .ai-devkit.json should no longer list the skill
      const config = JSON.parse(readFileSync(join(projectDir, '.ai-devkit.json'), 'utf-8'));
      const skills = (config.skills ?? []) as Array<{ name: string }>;
      expect(skills.some((s) => s.name === 'dev-lifecycle')).toBe(false);
    });

    it('should preserve remaining skills in .ai-devkit.json when removing one', () => {
      writeConfigFile(projectDir, {
        version: '1.0.0',
        environments: ['claude'],
        phases: [],
        skills: [
          { registry: 'codeaholicguy/ai-devkit', name: 'dev-lifecycle' },
          { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const skillDir = join(projectDir, '.claude', 'skills', 'dev-lifecycle');
      mkdirSync(skillDir, { recursive: true });

      run('skill remove dev-lifecycle', { cwd: projectDir });

      const config = JSON.parse(readFileSync(join(projectDir, '.ai-devkit.json'), 'utf-8'));
      const skills = (config.skills ?? []) as Array<{ name: string }>;
      expect(skills.some((s) => s.name === 'dev-lifecycle')).toBe(false);
      expect(skills.some((s) => s.name === 'memory')).toBe(true);
    });
  });
});

describe('Node.js compatibility', () => {
  it('should report correct Node.js version range support', () => {
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    expect(major).toBeGreaterThanOrEqual(20);

    // CLI should work on this Node version
    const result = run('--version');
    expect(result.exitCode).toBe(0);
  });
});
