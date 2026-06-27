import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
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
    expect(result.stdout).toContain('setup');
  });

  it('should run setup against an isolated home directory', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'ai-devkit-setup-e2e-home-'));

    try {
      const result = run('setup', { env: { HOME: homeDir } });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Setup Summary');
      expect(result.stdout).toContain('codex');
      expect(result.stdout).toContain('~/.codex does not exist.');
      expect(result.stdout).toContain('pi');
      expect(result.stdout).toContain('~/.pi does not exist.');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
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

  it('should not create workflow slash command directories', () => {
    run('init -e claude --all', { cwd: projectDir });

    expect(existsSync(join(projectDir, '.claude', 'commands'))).toBe(false);
    expect(existsSync(join(projectDir, '.cursor', 'commands'))).toBe(false);
    expect(existsSync(join(projectDir, '.codex', 'commands'))).toBe(false);
  });

  it('should initialize Cursor without workflow slash command directories', () => {
    run('init -e cursor -p requirements', { cwd: projectDir });

    expect(existsSync(join(projectDir, 'docs', 'ai', 'requirements', 'README.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.cursor', 'commands'))).toBe(false);
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

describe('CLI build artifacts', () => {
  it('should not include removed workflow command templates in dist', () => {
    const commandsDir = join(__dirname, '..', 'packages', 'cli', 'dist', 'templates', 'commands');
    const commandFiles = existsSync(commandsDir)
      ? readdirSync(commandsDir).filter((file) => file.endsWith('.md'))
      : [];

    expect(commandFiles).toEqual([]);
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
      createdAt: new Date().toISOString()
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
      createdAt: new Date().toISOString()
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
      createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
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
        createdAt: new Date().toISOString()
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

describe('agent sessions command', () => {
  interface ClaudeJsonlEntry {
    type: string;
    timestamp?: string;
    cwd?: string;
    message?: { content?: string };
  }

  interface CodexLine {
    type: string;
    timestamp?: string;
    payload?: { id?: string; cwd?: string; timestamp?: string; type?: string; message?: string };
  }

  function writeClaudeSession(home: string, recordedCwd: string, sessionId: string, firstUserMessage: string): string {
    return writeClaudeSessionInLaunchDir(home, recordedCwd, recordedCwd, sessionId, firstUserMessage);
  }

  /**
   * Write a Claude session under one launch dir's encoded path while the
   * session content records a different cwd. Lets us simulate the worktree
   * case (user cd'd into a subdir/worktree after launching Claude) by
   * passing different launch and recorded cwds.
   */
  function writeClaudeSessionInLaunchDir(
    home: string,
    launchCwd: string,
    recordedCwd: string,
    sessionId: string,
    firstUserMessage: string,
  ): string {
    const encoded = launchCwd.replace(/\//g, '-');
    const projectDir = join(home, '.claude', 'projects', encoded);
    mkdirSync(projectDir, { recursive: true });
    const filePath = join(projectDir, `${sessionId}.jsonl`);
    const entries: ClaudeJsonlEntry[] = [
      {
        type: 'user',
        timestamp: '2025-01-01T00:00:00Z',
        cwd: recordedCwd,
        message: { content: firstUserMessage },
      },
    ];
    writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join('\n'));
    return filePath;
  }

  function writeCodexSession(home: string, cwd: string, sessionId: string, firstUserMessage: string): string {
    const dayDir = join(home, '.codex', 'sessions', '2025', '01', '01');
    mkdirSync(dayDir, { recursive: true });
    const filePath = join(dayDir, `${sessionId}.jsonl`);
    const lines: CodexLine[] = [
      { type: 'session_meta', payload: { id: sessionId, cwd, timestamp: '2025-01-01T00:00:00Z' } },
      {
        type: 'event',
        timestamp: '2025-01-01T00:00:01Z',
        payload: { type: 'user_message', message: firstUserMessage },
      },
    ];
    writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n'));
    return filePath;
  }

  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ai-devkit-sessions-e2e-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('lists the sessions subcommand in agent --help', () => {
    const result = run('agent --help', { env: { HOME: home } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('sessions');
  });

  it('shows the --all hint when default-cwd lookup is empty', () => {
    const projectDir = createTempProject();
    try {
      const result = run('agent sessions', { cwd: projectDir, env: { HOME: home } });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--all');
    } finally {
      cleanupTempProject(projectDir);
    }
  });

  it('finds a Claude session recorded for the current cwd', () => {
    const projectDir = createTempProject();
    // macOS symlinks /var → /private/var; the spawned CLI's process.cwd()
    // returns the canonical path. Use realpath here so the recorded cwd in
    // the fake session matches what the CLI computes from process.cwd().
    const canonical = realpathSync(projectDir);
    try {
      writeClaudeSession(home, canonical, 'claude-here', 'hello from project');

      const result = run('agent sessions --json', { cwd: projectDir, env: { HOME: home } });
      expect(result.exitCode).toBe(0);

      const sessions = JSON.parse(result.stdout) as Array<{
        type: string;
        sessionId: string;
        cwd: string;
        firstUserMessage: string;
      }>;
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        type: 'claude',
        sessionId: 'claude-here',
        cwd: canonical,
        firstUserMessage: 'hello from project',
      });
    } finally {
      cleanupTempProject(projectDir);
    }
  });

  it('finds a session whose recorded cwd lives in a different launch dir (worktree case)', () => {
    const launchCwd = '/repo';
    const worktreeCwd = '/repo/.worktrees/feature';
    writeClaudeSessionInLaunchDir(home, launchCwd, worktreeCwd, 'wt-session', 'in worktree');

    const result = run(`agent sessions --cwd "${worktreeCwd}" --json`, { env: { HOME: home } });
    expect(result.exitCode).toBe(0);

    const sessions = JSON.parse(result.stdout) as Array<{ sessionId: string; cwd: string }>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sessionId: 'wt-session', cwd: worktreeCwd });
  });

  it('lists sessions across every cwd with --all', () => {
    writeClaudeSession(home, '/repo-a', 'claude-a', 'a');
    writeClaudeSession(home, '/repo-b', 'claude-b', 'b');
    writeCodexSession(home, '/repo-codex', 'codex-1', 'codex hi');

    const result = run('agent sessions --all --json', { env: { HOME: home } });
    expect(result.exitCode).toBe(0);

    const sessions = JSON.parse(result.stdout) as Array<{ type: string; sessionId: string }>;
    expect(sessions).toHaveLength(3);
    expect(sessions.map((s) => s.sessionId).sort()).toEqual(['claude-a', 'claude-b', 'codex-1']);
  });

  it('filters to one tool with --type', () => {
    writeClaudeSession(home, '/repo-claude', 'claude-1', 'c');
    writeCodexSession(home, '/repo-codex', 'codex-1', 'cx');

    const result = run('agent sessions --all --type codex --json', { env: { HOME: home } });
    expect(result.exitCode).toBe(0);

    const sessions = JSON.parse(result.stdout) as Array<{ type: string; sessionId: string }>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].type).toBe('codex');
    expect(sessions[0].sessionId).toBe('codex-1');
  });

  it('rejects an invalid --type with a clear error', () => {
    const result = run('agent sessions --all --type wrong', { env: { HOME: home } });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/Invalid --type "wrong"/);
  });

  it('caps rows with --limit', () => {
    writeClaudeSession(home, '/r1', 's1', 'one');
    writeClaudeSession(home, '/r2', 's2', 'two');
    writeClaudeSession(home, '/r3', 's3', 'three');

    const result = run('agent sessions --all --limit 2 --json', { env: { HOME: home } });
    expect(result.exitCode).toBe(0);

    const sessions = JSON.parse(result.stdout) as Array<{ sessionId: string }>;
    expect(sessions).toHaveLength(2);
  });

  it('treats --limit 0 as unlimited', () => {
    for (let i = 0; i < 3; i++) {
      writeClaudeSession(home, `/r${i}`, `s${i}`, `msg-${i}`);
    }

    const result = run('agent sessions --all --limit 0 --json', { env: { HOME: home } });
    expect(result.exitCode).toBe(0);

    const sessions = JSON.parse(result.stdout) as Array<unknown>;
    expect(sessions).toHaveLength(3);
  });

  it('emits a JSON schema with expected fields and ISO date strings', () => {
    writeClaudeSession(home, '/repo', 'claude-z', 'hello');

    const result = run('agent sessions --all --json', { env: { HOME: home } });
    expect(result.exitCode).toBe(0);

    const sessions = JSON.parse(result.stdout);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        type: 'claude',
        sessionId: 'claude-z',
        cwd: '/repo',
        firstUserMessage: 'hello',
        sessionFilePath: expect.any(String),
      }),
    );
    expect(sessions[0].lastActive).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(sessions[0].startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
