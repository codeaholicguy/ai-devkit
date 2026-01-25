---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide: Skill Management

## Development Setup
**How do we get started?**

### Prerequisites and Dependencies
```bash
# Install new dependencies
npm install simple-git inquirer cli-table3 zod fs-extra --workspace=packages/cli

# Development dependencies
npm install @types/inquirer @types/fs-extra --save-dev --workspace=packages/cli
```

### Environment Setup Steps
1. Ensure Node.js 18+ is installed
2. Run `npm install` in project root
3. Test CLI locally: `npm run build --workspace=packages/cli && node packages/cli/dist/cli.js`

### Configuration Needed
- Create sample `skills/registry.json` in repo root
- Set up GitHub raw URL for registry: `https://raw.githubusercontent.com/Codeaholicguy/ai-devkit/main/skills/registry.json`

## Code Structure
**How is the code organized?**

### Directory Structure
```
packages/cli/src/
├── commands/
│   └── skill.ts              # CLI command handlers
├── lib/
│   ├── SkillManager.ts       # Main orchestrator
│   ├── RegistryService.ts    # Registry fetch and cache
│   ├── CacheManager.ts       # Local skill cache management
│   ├── GitService.ts         # Git operations wrapper
│   ├── InstallationService.ts # Skill installation (copy/symlink)
│   └── Config.ts             # Extended for skill manifest
├── types.ts                  # Type definitions
└── util/
    └── paths.ts              # Path helpers
```

### Module Organization
- **Commands**: User-facing CLI commands (thin layer)
- **Lib**: Core business logic (reusable services)
- **Types**: Shared TypeScript interfaces
- **Util**: Helper functions (path resolution, validation)

### Naming Conventions
- **Classes**: PascalCase (e.g., `SkillManager`)
- **Methods**: camelCase (e.g., `addSkill()`)
- **Interfaces**: PascalCase with descriptive names (e.g., `SkillRegistry`, `InstalledSkill`)
- **Files**: PascalCase for classes, kebab-case for utilities
- **Constants**: UPPER_SNAKE_CASE (e.g., `REGISTRY_CACHE_EXPIRY`)

## Implementation Notes
**Key technical details to remember:**

### Core Features

#### Feature 1: Registry Management
**Implementation Approach**:
```typescript
// src/lib/RegistryService.ts
import fetch from 'node-fetch';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const REGISTRY_URL = 'https://raw.githubusercontent.com/Codeaholicguy/ai-devkit/main/skills/registry.json';
const REGISTRY_CACHE_PATH = path.join(os.homedir(), '.ai-devkit', 'registry.json');
const CACHE_EXPIRY_HOURS = 24;

export class RegistryService {
  async fetchRegistry(): Promise<SkillRegistry> {
    // Check cache first
    if (await this.isCacheValid()) {
      return this.readCachedRegistry();
    }
    
    // Fetch from GitHub
    try {
      const response = await fetch(REGISTRY_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch registry: ${response.statusText}`);
      }
      
      const registry = await response.json() as SkillRegistry;
      
      // Validate schema
      this.validateRegistry(registry);
      
      // Cache locally
      await this.cacheRegistry(registry);
      
      return registry;
    } catch (error) {
      // Fall back to cache if available
      if (await fs.pathExists(REGISTRY_CACHE_PATH)) {
        console.warn('Using cached registry due to network error');
        return this.readCachedRegistry();
      }
      throw error;
    }
  }
  
  private async isCacheValid(): Promise<boolean> {
    if (!await fs.pathExists(REGISTRY_CACHE_PATH)) return false;
    
    const stats = await fs.stat(REGISTRY_CACHE_PATH);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    
    return ageHours < CACHE_EXPIRY_HOURS;
  }
}
```

**Key Points**:
- Always try cache first for performance
- Validate schema using Zod before trusting data
- Fall back to cache on network errors
- Make cache expiry configurable via user config

#### Feature 2: Skill Caching
**Implementation Approach**:
```typescript
// src/lib/CacheManager.ts
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';

const CACHE_ROOT = path.join(os.homedir(), '.ai-devkit', 'skills');

export class CacheManager {
  async ensureSkillCached(
    registry: RegistryEntry,
    skillName: string
  ): Promise<string> {
    const repoPath = this.getRepoPath(registry.id);
    const skillPath = path.join(repoPath, skillName);
    
    // Check if repo is already cloned
    if (!await fs.pathExists(repoPath)) {
      console.log(`Cloning ${registry.name}...`);
      await this.gitService.cloneRepo(registry.url, repoPath, registry.branch);
    } else {
      console.log(`Using cached ${registry.name}`);
    }
    
    // Verify skill exists in repo
    if (!await fs.pathExists(skillPath)) {
      throw new Error(`Skill '${skillName}' not found in ${registry.id}`);
    }
    
    // Verify skill structure (SKILL.md must exist)
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillMdPath)) {
      throw new Error(`Invalid skill: SKILL.md not found in ${skillName}`);
    }
    
    return skillPath;
  }
  
  private getRepoPath(registryId: string): string {
    // Handle verified vs untrusted registries
    const isUntrusted = false; // Check against verified list
    const prefix = isUntrusted ? path.join(CACHE_ROOT, 'untrusted') : CACHE_ROOT;
    
    // registryId example: "anthropics/skills"
    return path.join(prefix, registryId);
  }
}
```

**Key Points**:
- Clone once, reuse across projects
- Validate skill structure before returning
- Separate verified and untrusted skills in cache
- Provide clear progress feedback during clone

#### Feature 3: Git Operations
**Implementation Approach**:
```typescript
// src/lib/GitService.ts
import simpleGit, { SimpleGit, SimpleGitProgressEvent } from 'simple-git';
import * as fs from 'fs-extra';

export class GitService {
  private git: SimpleGit;
  
  constructor() {
    this.git = simpleGit();
  }
  
  async cloneRepo(
    url: string,
    targetPath: string,
    branch: string = 'main',
    onProgress?: (progress: SimpleGitProgressEvent) => void
  ): Promise<void> {
    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(targetPath));
    
    // Clone with progress
    await this.git.clone(url, targetPath, {
      '--branch': branch,
      '--depth': '1', // Shallow clone for speed
      '--progress': null,
    }, (progress) => {
      if (onProgress) onProgress(progress);
    });
  }
  
  async pullRepo(repoPath: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.pull();
  }
  
  async getCommitHash(repoPath: string): Promise<string> {
    const git = simpleGit(repoPath);
    const log = await git.log(['-1']);
    return log.latest?.hash || 'unknown';
  }
}
```

**Key Points**:
- Use shallow clone (`--depth 1`) for speed
- Provide progress feedback for UX
- Handle auth errors gracefully
- Support custom branches

#### Feature 4: Skill Installation
**Implementation Approach**:
```typescript
// src/lib/InstallationService.ts
import * as fs from 'fs-extra';
import * as path from 'path';

export class InstallationService {
  async installSkill(
    sourcePath: string,
    skillName: string,
    method: 'copy' | 'symlink',
    environments: string[]
  ): Promise<void> {
    const targets = this.getInstallationTargets(environments);
    
    for (const targetDir of targets) {
      const targetPath = path.join(targetDir, skillName);
      
      // Remove existing installation
      await fs.remove(targetPath);
      
      // Install based on method
      if (method === 'copy') {
        await fs.copy(sourcePath, targetPath);
        console.log(`✓ Copied to ${targetPath}`);
      } else {
        // Check symlink support
        if (!this.isSymlinkSupported()) {
          console.warn('Symlinks not supported, falling back to copy');
          await fs.copy(sourcePath, targetPath);
        } else {
          await fs.ensureDir(path.dirname(targetPath));
          await fs.symlink(sourcePath, targetPath, 'dir');
          console.log(`✓ Linked to ${targetPath}`);
        }
      }
    }
  }
  
  private getInstallationTargets(environments: string[]): string[] {
    const cwd = process.cwd();
    const targets: string[] = [];
    
    if (environments.includes('cursor')) {
      targets.push(path.join(cwd, '.cursor', 'skills'));
    }
    if (environments.includes('claude')) {
      targets.push(path.join(cwd, '.claude', 'skills'));
    }
    
    return targets;
  }
  
  private isSymlinkSupported(): boolean {
    // On Windows, check if developer mode is enabled
    if (process.platform === 'win32') {
      // Try to create a test symlink
      try {
        const testDir = path.join(os.tmpdir(), 'ai-devkit-symlink-test');
        fs.ensureDirSync(testDir);
        fs.symlinkSync(testDir, testDir + '-link', 'dir');
        fs.removeSync(testDir + '-link');
        fs.removeSync(testDir);
        return true;
      } catch {
        return false;
      }
    }
    return true; // macOS and Linux support symlinks
  }
}
```

**Key Points**:
- Support both copy and symlink methods
- Detect symlink support on Windows
- Create target directories if they don't exist
- Remove existing installations before reinstalling

#### Feature 5: Skill Manager Orchestration
**Implementation Approach**:
```typescript
// src/lib/SkillManager.ts
export class SkillManager {
  async addSkill(options: AddSkillOptions): Promise<void> {
    // 1. Parse input
    const { registryId, skillName } = this.parseSkillRef(options.ref);
    
    // 2. Fetch registry and validate
    const registry = await this.registryService.fetchRegistry();
    const registryEntry = registry.registries.find(r => r.id === registryId);
    
    if (!registryEntry) {
      console.warn(`⚠️  Registry '${registryId}' is not verified.`);
      console.warn(`   This may be an untrusted source.`);
      const confirm = await this.promptConfirm('Continue with installation?');
      if (!confirm) return;
      
      // Construct unverified registry entry
      registryEntry = {
        id: registryId,
        name: registryId,
        description: 'Unverified registry',
        url: `https://github.com/${registryId}.git`,
        verified: false
      };
    }
    
    // 3. Ensure skill is cached
    const sourcePath = await this.cacheManager.ensureSkillCached(
      registryEntry,
      skillName
    );
    
    // 4. Get or create project config
    let config = await this.configManager.readProjectConfig();
    if (!config) {
      console.log('No .ai-devkit.json found. Let\'s set it up!');
      config = await this.configManager.ensureProjectConfig();
    }
    
    // 5. Determine installation method
    const method = options.method || await this.promptInstallMethod();
    
    // 6. Install skill
    await this.installationService.installSkill(
      sourcePath,
      skillName,
      method,
      config.environments
    );
    
    // 7. Update manifest
    await this.updateManifest({
      name: skillName,
      registry: registryId,
      source: sourcePath,
      installMethod: method,
      installedAt: new Date().toISOString(),
      version: await this.gitService.getCommitHash(path.dirname(sourcePath)),
      environments: config.environments
    });
    
    console.log(`\n✅ Successfully installed '${skillName}'`);
  }
  
  private parseSkillRef(ref: string): { registryId: string; skillName: string } {
    // Format: "anthropics/skills frontend-design"
    const parts = ref.split(' ');
    if (parts.length !== 2) {
      throw new Error('Invalid format. Use: ai-devkit skill add <registry>/<repo> <skill-name>');
    }
    return { registryId: parts[0], skillName: parts[1] };
  }
}
```

**Key Points**:
- Orchestrate all services in correct order
- Provide clear feedback at each step
- Handle errors gracefully with rollback
- Warn users about untrusted registries

### Patterns & Best Practices

#### Error Handling Pattern
```typescript
// All service methods should throw descriptive errors
class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Usage
throw new ServiceError(
  'Failed to clone repository. Check your network connection.',
  'CLONE_FAILED',
  true // User can retry
);

// In CLI command
try {
  await skillManager.addSkill(options);
} catch (error) {
  if (error instanceof ServiceError) {
    console.error(`❌ ${error.message}`);
    if (error.recoverable) {
      console.log('💡 Tip: Try again or check your connection.');
    }
  } else {
    console.error('❌ Unexpected error:', error);
  }
  process.exit(1);
}
```

#### Progress Feedback Pattern
```typescript
// Use ora for spinners
import ora from 'ora';

const spinner = ora('Cloning repository...').start();
try {
  await gitService.cloneRepo(url, path, branch, (progress) => {
    spinner.text = `Cloning: ${progress.progress}%`;
  });
  spinner.succeed('Repository cloned');
} catch (error) {
  spinner.fail('Clone failed');
  throw error;
}
```

#### Configuration Management Pattern
```typescript
// Always use ConfigManager for file operations
// Never directly read/write config files

// Good:
const config = await configManager.readProjectConfig();

// Bad:
const config = JSON.parse(fs.readFileSync('.ai-devkit.json', 'utf-8'));
```

## Integration Points
**How do pieces connect?**

### CLI to SkillManager
```typescript
// src/commands/skill.ts
export function registerSkillCommand(program: Command) {
  const skillCommand = program
    .command('skill')
    .description('Manage Agent Skills');
  
  skillCommand
    .command('add <registry-repo> <skill-name>')
    .description('Install a skill')
    .option('--method <copy|symlink>', 'Installation method')
    .option('--env <cursor|claude>', 'Target environment')
    .option('--force', 'Force reinstall if exists')
    .action(async (registryRepo, skillName, options) => {
      const skillManager = new SkillManager(
        new RegistryService(),
        new CacheManager(new GitService()),
        new InstallationService(),
        new ConfigManager()
      );
      
      await skillManager.addSkill({
        ref: `${registryRepo} ${skillName}`,
        ...options
      });
    });
}
```

### Service Dependencies
```typescript
// Dependency injection for testability
class SkillManager {
  constructor(
    private registryService: RegistryService,
    private cacheManager: CacheManager,
    private installationService: InstallationService,
    private configManager: ConfigManager
  ) {}
}

// In tests, inject mocks:
const mockRegistry = new MockRegistryService();
const manager = new SkillManager(mockRegistry, ...);
```

## Error Handling
**How do we handle failures?**

### Error Handling Strategy
1. **Network Errors**: Fall back to cached data when possible
2. **Git Errors**: Provide clear messages with recovery steps
3. **File System Errors**: Check permissions, suggest solutions
4. **Validation Errors**: Show specific field/value causing issue
5. **User Cancellation**: Exit gracefully without errors

### Logging Approach
```typescript
// Use different log levels
import debug from 'debug';

const log = debug('ai-devkit:skill');
const error = debug('ai-devkit:skill:error');

log('Fetching registry from %s', REGISTRY_URL);
error('Failed to clone: %O', err);

// Enable with: DEBUG=ai-devkit:* ai-devkit skill add ...
```

### Retry/Fallback Mechanisms
```typescript
// Retry network operations
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Performance Considerations
**How do we keep it fast?**

### Optimization Strategies
1. **Shallow Git Clones**: Use `--depth 1` to only clone latest commit
2. **Registry Caching**: Cache for 24 hours to avoid repeated fetches
3. **Lazy Loading**: Only clone repos when skills are actually needed
4. **Concurrent Operations**: Install to multiple environments in parallel

### Caching Approach
```typescript
// Cache registry in memory for session
class RegistryService {
  private memoryCache: SkillRegistry | null = null;
  
  async fetchRegistry(): Promise<SkillRegistry> {
    if (this.memoryCache) return this.memoryCache;
    
    // Fetch and cache
    this.memoryCache = await this.fetchFromDiskOrNetwork();
    return this.memoryCache;
  }
}
```

### Resource Management
```typescript
// Clean up temp files
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-devkit-'));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.remove(tmpDir);
  }
}
```

## Security Notes
**What security measures are in place?**

### Input Validation
```typescript
// Validate registry IDs to prevent path traversal
function validateRegistryId(id: string): void {
  if (!/^[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+$/.test(id)) {
    throw new Error('Invalid registry ID format');
  }
  
  if (id.includes('..') || id.includes('~')) {
    throw new Error('Invalid characters in registry ID');
  }
}

// Validate skill names
function validateSkillName(name: string): void {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error('Skill name must contain only lowercase letters, numbers, and hyphens');
  }
}
```

### Path Traversal Prevention
```typescript
// Ensure paths stay within expected directories
function sanitizePath(basePath: string, userPath: string): string {
  const resolved = path.resolve(basePath, userPath);
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
```

### Git URL Validation
```typescript
// Only allow HTTPS GitHub URLs for verified registries
function validateGitUrl(url: string): void {
  const allowedPattern = /^https:\/\/github\.com\/[\w-]+\/[\w-]+(\.git)?$/;
  if (!allowedPattern.test(url)) {
    throw new Error('Only GitHub HTTPS URLs are allowed');
  }
}
```

### Trust Warnings
```typescript
// Always warn for unverified registries
if (!registryEntry.verified) {
  console.warn('⚠️  WARNING: This registry is not verified');
  console.warn('   Installing skills from untrusted sources may be dangerous');
  console.warn('   Review the code before use');
  
  const confirm = await promptConfirm('Do you trust this source?');
  if (!confirm) {
    console.log('Installation cancelled');
    process.exit(0);
  }
}
```
