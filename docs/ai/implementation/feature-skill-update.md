---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide: Skill Update

## Development Setup
**How do we get started?**

### Prerequisites
- Node.js 18+ installed
- Git installed and in PATH
- Existing ai-devkit development environment
- Test skill registries for validation

### Environment Setup
```bash
# Clone repository (if not already done)
git clone https://github.com/Codeaholicguy/ai-devkit.git
cd ai-devkit

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Link for local testing
cd packages/cli
npm link
```

### Configuration
- No additional configuration needed
- Uses existing `SKILL_CACHE_DIR` constant
- Relies on system git credentials

## Code Structure
**How is the code organized?**

### Files to Modify
```
packages/cli/src/
├── commands/
│   └── skill.ts                    # Add 'update' command
├── lib/
│   └── SkillManager.ts             # Add update methods
├── util/
│   └── git.ts                      # Add git utilities
└── __tests__/
    ├── lib/
    │   └── SkillManager.test.ts    # Add update tests
    └── util/
        └── git.test.ts             # Add git utility tests
```

### Module Organization
- **Commands**: CLI command definitions and handlers
- **Lib**: Business logic and orchestration
- **Util**: Reusable utilities (git, validation, etc.)
- **Tests**: Mirror source structure

### Naming Conventions
- **Interfaces**: PascalCase (e.g., `UpdateResult`, `UpdateSummary`)
- **Functions**: camelCase (e.g., `updateSkills`, `pullRepository`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `SKILL_CACHE_DIR`)
- **Private methods**: camelCase with `private` modifier

## Implementation Notes
**Key technical details to remember:**

### Core Features

#### 1. Git Repository Detection
**File**: `packages/cli/src/util/git.ts`

```typescript
/**
 * Checks if a directory is a git repository
 * @param dirPath - Absolute path to directory
 * @returns true if .git directory exists
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  const gitDir = path.join(dirPath, '.git');
  return await fs.pathExists(gitDir);
}
```

**Key Points**:
- Simple check for `.git` directory
- No git command execution needed
- Fast and reliable

#### 2. Git Pull Operation
**File**: `packages/cli/src/util/git.ts`

```typescript
/**
 * Pulls latest changes for a git repository
 * @param repoPath - Absolute path to git repository
 * @throws Error if git pull fails
 */
export async function pullRepository(repoPath: string): Promise<void> {
  try {
    await execAsync('git pull', {
      cwd: repoPath,
      timeout: 30000, // 30 second timeout
    });
  } catch (error: any) {
    // Extract meaningful error message
    const message = error.message || 'Unknown error';
    throw new Error(`Git pull failed: ${message}`);
  }
}
```

**Key Points**:
- Use `cwd` option to run in correct directory
- 30-second timeout prevents hanging
- Preserve error messages for user feedback
- Don't use `--depth 1` (that's for clone, not pull)

#### 3. Update Single Registry
**File**: `packages/cli/src/lib/SkillManager.ts`

```typescript
private async updateRegistry(
  registryPath: string,
  registryId: string
): Promise<UpdateResult> {
  // Check if it's a git repository
  const isGit = await isGitRepository(registryPath);
  
  if (!isGit) {
    return {
      registryId,
      status: 'skipped',
      message: 'Not a git repository',
    };
  }

  // Attempt to pull
  try {
    await pullRepository(registryPath);
    return {
      registryId,
      status: 'success',
      message: 'Updated successfully',
    };
  } catch (error: any) {
    return {
      registryId,
      status: 'error',
      message: error.message,
      error,
    };
  }
}
```

**Key Points**:
- Always check git status first
- Don't throw errors, return error status
- Preserve error object for detailed reporting

#### 4. Update All or Specific Registry
**File**: `packages/cli/src/lib/SkillManager.ts`

```typescript
async updateSkills(registryId?: string): Promise<UpdateSummary> {
  console.log(registryId 
    ? `Updating registry: ${registryId}...` 
    : 'Updating all skills...'
  );
  
  // Ensure git is installed
  await ensureGitInstalled();

  // Scan cache directory
  const cacheDir = SKILL_CACHE_DIR;
  if (!await fs.pathExists(cacheDir)) {
    console.log(chalk.yellow('No skills cache found. Nothing to update.'));
    return { total: 0, successful: 0, skipped: 0, failed: 0, results: [] };
  }

  // Get all registry directories
  const entries = await fs.readdir(cacheDir, { withFileTypes: true });
  const registries: Array<{ path: string; id: string }> = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const ownerPath = path.join(cacheDir, entry.name);
      const repos = await fs.readdir(ownerPath, { withFileTypes: true });
      
      for (const repo of repos) {
        if (repo.isDirectory()) {
          const fullRegistryId = `${entry.name}/${repo.name}`;
          
          // Filter by registryId if provided
          if (!registryId || fullRegistryId === registryId) {
            registries.push({
              path: path.join(ownerPath, repo.name),
              id: fullRegistryId,
            });
          }
        }
      }
    }
  }

  // If specific registry requested but not found
  if (registryId && registries.length === 0) {
    throw new Error(`Registry "${registryId}" not found in cache.`);
  }

  // Update each registry
  const results: UpdateResult[] = [];
  
  for (const registry of registries) {
    console.log(chalk.dim(`\n  → ${registry.id}...`));
    const result = await this.updateRegistry(registry.path, registry.id);
    results.push(result);
    
    // Show immediate feedback
    if (result.status === 'success') {
      console.log(chalk.green(`    ✓ Updated`));
    } else if (result.status === 'skipped') {
      console.log(chalk.yellow(`    ⊘ Skipped (${result.message})`));
    } else {
      console.log(chalk.red(`    ✗ Failed`));
    }
  }

  // Calculate summary
  const summary: UpdateSummary = {
    total: results.length,
    successful: results.filter(r => r.status === 'success').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'error').length,
    results,
  };

  // Display summary
  this.displayUpdateSummary(summary);
  
  return summary;
}
```

**Key Points**:
- Scan cache directory structure (`owner/repo`)
- Filter by registryId if provided
- Show progress for each registry
- Continue on errors
- Collect all results before summarizing

#### 5. Display Summary
**File**: `packages/cli/src/lib/SkillManager.ts`

```typescript
private displayUpdateSummary(summary: UpdateSummary): void {
  console.log(chalk.bold('\n\nSummary:'));
  
  if (summary.successful > 0) {
    console.log(chalk.green(`  ✓ ${summary.successful} updated`));
  }
  
  if (summary.skipped > 0) {
    console.log(chalk.yellow(`  ⊘ ${summary.skipped} skipped`));
  }
  
  if (summary.failed > 0) {
    console.log(chalk.red(`  ✗ ${summary.failed} failed`));
  }

  // Show detailed errors
  const errors = summary.results.filter(r => r.status === 'error');
  if (errors.length > 0) {
    console.log(chalk.bold('\n\nErrors:'));
    
    for (const error of errors) {
      console.log(chalk.red(`  • ${error.registryId}: ${error.message}`));
      
      // Provide helpful tips for common errors
      if (error.message.includes('uncommitted') || error.message.includes('unstaged')) {
        console.log(chalk.dim(`    Tip: Run 'git status' in ~/.ai-devkit/skills/${error.registryId} to see details.`));
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        console.log(chalk.dim(`    Tip: Check your internet connection and try again.`));
      }
    }
  }
  
  console.log(); // Empty line at end
}
```

**Key Points**:
- Use color coding for visual clarity
- Show counts for each status
- Provide detailed error messages
- Include helpful tips for common issues

#### 6. CLI Command
**File**: `packages/cli/src/commands/skill.ts`

```typescript
skillCommand
  .command('update [registry-id]')
  .description('Update skills from registries (e.g., ai-devkit skill update or ai-devkit skill update anthropic/skills)')
  .action(async (registryId?: string) => {
    try {
      const configManager = new ConfigManager();
      const skillManager = new SkillManager(configManager);
      
      await skillManager.updateSkills(registryId);
    } catch (error: any) {
      console.error(chalk.red(`\nFailed to update skills: ${error.message}\n`));
      process.exit(1);
    }
  });
```

**Key Points**:
- Optional `registry-id` parameter
- Consistent error handling with other commands
- Exit code 1 on failure

### Patterns & Best Practices

#### Error Handling Pattern
```typescript
// DON'T throw in loops - collect errors instead
for (const item of items) {
  try {
    await processItem(item);
  } catch (error) {
    throw error; // ❌ Stops processing other items
  }
}

// DO collect errors and continue
for (const item of items) {
  try {
    await processItem(item);
    results.push({ status: 'success' });
  } catch (error) {
    results.push({ status: 'error', error }); // ✅ Continues processing
  }
}
```

#### Progress Feedback Pattern
```typescript
// Show progress before operation
console.log(chalk.dim(`  → ${item.name}...`));

// Perform operation
const result = await processItem(item);

// Show immediate result
if (result.success) {
  console.log(chalk.green(`    ✓ Success`));
} else {
  console.log(chalk.red(`    ✗ Failed`));
}
```

#### Git Command Pattern
```typescript
// Always set cwd and timeout
await execAsync('git <command>', {
  cwd: repositoryPath,  // Run in correct directory
  timeout: 30000,       // Prevent hanging
});
```

## Integration Points
**How do pieces connect?**

### Existing SkillManager Integration
- **No changes to existing methods**: `addSkill`, `listSkills`, `removeSkill`
- **New methods are additive**: `updateSkills`, `updateRegistry`, `displayUpdateSummary`
- **Reuses existing constants**: `SKILL_CACHE_DIR`
- **Reuses existing utilities**: `ensureGitInstalled`

### Git Utilities Integration
- **Extends existing module**: Add functions to `util/git.ts`
- **Follows existing patterns**: Use `execAsync`, similar error handling
- **Reuses existing imports**: `fs-extra`, `path`, `child_process`

### CLI Integration
- **Adds new command**: Follows existing command pattern
- **Consistent error handling**: Same try/catch structure
- **Consistent styling**: Uses chalk like other commands

## Error Handling
**How do we handle failures?**

### Error Categories

#### 1. Pre-flight Errors (Fail Fast)
- Git not installed → Show installation instructions
- Specific registry not found → Clear error message

#### 2. Per-Registry Errors (Collect and Continue)
- Git pull fails → Collect error, continue to next
- Network timeout → Collect error, continue to next
- Merge conflicts → Collect error, continue to next

#### 3. Error Messages
```typescript
// Good error messages
throw new Error('Registry "anthropic/skills" not found in cache.');
throw new Error('Git pull failed: You have unstaged changes.');

// Bad error messages
throw new Error('Error'); // ❌ Not helpful
throw new Error(error); // ❌ Might be object
```

### Logging Strategy
- **Info**: Progress updates (which registry is being updated)
- **Success**: Green checkmarks for successful updates
- **Warning**: Yellow indicators for skipped items
- **Error**: Red indicators and detailed error messages
- **Debug**: Not needed for this feature

## Performance Considerations
**How do we keep it fast?**

### Optimization Strategies

#### 1. Sequential Processing (v1)
- Process registries one at a time
- Simpler error handling
- Easier to show progress
- Good enough for typical use (< 10 registries)

#### 2. Future: Parallel Processing (v2)
```typescript
// Potential future enhancement
const results = await Promise.allSettled(
  registries.map(r => this.updateRegistry(r.path, r.id))
);
```

#### 3. Timeout Protection
- 30-second timeout per git pull
- Prevents hanging on network issues
- User can retry manually if needed

#### 4. Minimal File System Operations
- Single scan of cache directory
- No redundant checks
- Use `fs.readdir` with `withFileTypes` for efficiency

### Resource Management
- **Memory**: Minimal (no large buffers)
- **CPU**: Low (mostly waiting on git)
- **Network**: One pull per registry (can't optimize)
- **Disk I/O**: Minimal (git handles this)

## Security Notes
**What security measures are in place?**

### Input Validation
```typescript
// Validate registry ID format
if (registryId && !registryId.match(/^[\w-]+\/[\w-]+$/)) {
  throw new Error('Invalid registry ID format. Expected: owner/repo');
}

// Validate paths to prevent traversal
const normalizedPath = path.normalize(registryPath);
if (!normalizedPath.startsWith(SKILL_CACHE_DIR)) {
  throw new Error('Invalid registry path');
}
```

### Command Injection Prevention
```typescript
// DON'T use string interpolation
await execAsync(`git pull ${userInput}`); // ❌ Injection risk

// DO use fixed commands only
await execAsync('git pull', { cwd: userInput }); // ✅ Safe
```

### Credential Handling
- **No credential storage**: Rely on system git credentials
- **No credential prompts**: Fail if authentication required
- **Use HTTPS URLs**: Avoid SSH key complexity

### File System Safety
- **Read-only operations**: Only git pull modifies files
- **No file deletion**: Update doesn't remove anything
- **Path validation**: Ensure operations stay in cache directory

