import type { Command } from 'commander';
import { getCodexCapacityReport } from '@ai-devkit/agent-manager';
import { renderCapacityReport } from './capacity/render.js';
import type { CapacityReport } from '@ai-devkit/agent-manager';

type CapacityOptions = { json?: boolean };
type ReportReader = () => Promise<CapacityReport>;

export async function capacityCommand(
  provider: string | undefined,
  options: CapacityOptions,
  readReport: ReportReader = getCodexCapacityReport
): Promise<void> {
  if (provider !== undefined && provider.toLowerCase() !== 'codex') {
    throw new Error(`Unknown capacity provider "${provider}". Only "codex" is supported.`);
  }
  const report = await readReport();
  renderCapacityReport(report, options);
}

export function registerCapacityCommand(program: Command, readReport: ReportReader = getCodexCapacityReport): void {
  program
    .command('capacity [provider]')
    .description('Report Codex capacity without consuming model quota')
    .option('--json', 'Output a schema-v1 JSON report')
    .action((provider: string | undefined, options: CapacityOptions) =>
      capacityCommand(provider, options, readReport));
}
