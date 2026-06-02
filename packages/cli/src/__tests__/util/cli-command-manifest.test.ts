import { describe, expect, it } from 'vitest';
import { CLI_COMMANDS } from '../../cli-command-manifest.js';
import { resolveLightweightCliResponse, resolveTopLevelCommandModule } from '../../cli-runtime.js';

describe('CLI command manifest', () => {
  it('is the shared source for root help and top-level dispatch', () => {
    const rootHelp = resolveLightweightCliResponse(['--help'], '1.2.3').output ?? '';

    for (const command of CLI_COMMANDS) {
      expect(rootHelp).toContain(command.usage);
      expect(resolveTopLevelCommandModule([command.name])).toBe(command.modulePath);
    }
  });

  it('renders declared options and subcommands in static command help', () => {
    for (const command of CLI_COMMANDS) {
      const commandHelp = resolveLightweightCliResponse([command.name, '--help'], '1.2.3').output ?? '';

      for (const option of command.options ?? []) {
        expect(commandHelp).toContain(option.flags);
      }

      for (const subcommand of command.subcommands ?? []) {
        expect(commandHelp).toContain(subcommand.usage);
      }
    }
  });
});
