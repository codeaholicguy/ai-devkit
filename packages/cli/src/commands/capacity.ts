import type { Command } from 'commander';
import { getCapacityReport } from './capacity/orchestrate.js';
import { renderCapacityReport } from './capacity/render.js';
import type { CapacityReport } from './capacity/types.js';

type RawCapacityOptions = { json?: boolean; maxAge?: string; refresh?: boolean };
type ReportReader = (options: {
  provider?: string; maxAge: number; refresh: boolean;
}) => Promise<CapacityReport>;

export async function capacityCommand(
  provider: string | undefined,
  options: RawCapacityOptions,
  readReport: ReportReader = getCapacityReport
): Promise<void> {
  const maxAge = options.maxAge === undefined ? 300 : Number(options.maxAge);
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    throw new Error('--max-age must be a non-negative integer.');
  }
  const report = await readReport({ provider, maxAge, refresh: options.refresh === true });
  renderCapacityReport(report, options);
}

export function registerCapacityCommand(program: Command, readReport: ReportReader = getCapacityReport): void {
  program
    .command('capacity [provider]')
    .description('Report configured AI provider capacity without consuming model quota')
    .option('--json', 'Output a schema-v1 JSON report')
    .option('--max-age <seconds>', 'Maximum cache age in seconds', '300')
    .option('--refresh', 'Bypass cached capacity data')
    .action((provider: string | undefined, options: RawCapacityOptions) =>
      capacityCommand(provider, options, readReport));
}
