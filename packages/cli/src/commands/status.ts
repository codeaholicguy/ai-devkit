import type { Command } from 'commander';
import { getStatusReport, type StatusReport } from '../services/status/status.service.js';
import { withErrorHandler } from '../util/errors.js';
import { renderStatusReport } from './status/render.js';

type ReportReader = () => Promise<StatusReport>;

export function registerStatusCommand(
  program: Command,
  readReport: ReportReader = getStatusReport,
): void {
  program
    .command('status')
    .description('Report AI DevKit setup and readiness')
    .option('-j, --json', 'Output as JSON')
    .action(withErrorHandler('report status', async (options: { json?: boolean }) => {
      renderStatusReport(await readReport(), options);
    }));
}
