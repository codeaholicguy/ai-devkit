import { Command } from 'commander';
import { ConfigManager } from '../lib/Config.js';
import { FeatureDoc, TemplateManager } from '../lib/TemplateManager.js';
import { formatLocalDate } from '../util/time.js';
import { ui } from '../util/terminal-ui.js';
import { normalizeFeatureName, validateFeatureNameRule } from '../services/lint/rules/feature-name.rule.js';

interface InitFeatureOptions {
  json?: boolean;
}

export function registerDocsCommand(program: Command): void {
  const docs = program
    .command('docs')
    .description('Manage AI DevKit documentation');

  docs
    .command('init-feature <name>')
    .description('Initialize date-prefixed feature documentation from phase templates')
    .option('--json', 'Output generated paths as JSON')
    .action(initFeatureDocsCommand);
}

async function initFeatureDocsCommand(name: string, options: InitFeatureOptions): Promise<void> {
  const validation = validateFeatureNameRule(name);
  if (validation.check) {
    ui.error(`Invalid feature name: ${name}`);
    process.exitCode = 1;
    return;
  }

  const date = formatLocalDate();
  const configManager = new ConfigManager();
  const docsDir = await configManager.getDocsDir();
  const phases = await configManager.getPhases();
  const featureName = normalizeFeatureName(name);
  const templateManager = new TemplateManager({ docsDir });

  try {
    const files = await templateManager.copyFeatureDocTemplates(featureName, { date, phases });
    renderInitFeatureResult({
      feature: featureName,
      date,
      docsDir,
      files
    }, Boolean(options.json));
  } catch (error) {
    ui.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function renderInitFeatureResult(
  result: {
    feature: string;
    date: string;
    docsDir: string;
    files: FeatureDoc[];
  },
  json: boolean
): void {
  if (json) {
    ui.text(JSON.stringify({
      feature: result.feature,
      date: result.date,
      docsDir: result.docsDir,
      files: result.files.map(file => ({
        phase: file.phase,
        path: file.relativePath
      }))
    }, null, 2));
    return;
  }

  ui.success(`Created ${result.files.length} feature doc(s) for ${result.feature}.`);
  result.files.forEach(file => ui.text(file.relativePath));
}
