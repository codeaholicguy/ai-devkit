import { describe, expect, it } from 'vitest';
import { AGENTS } from '../../../src/utils/agents.js';

describe('AGENTS', () => {
    it('includes Copilot as a startable agent', () => {
        expect(AGENTS.copilot.command).toBe('copilot');
        expect(AGENTS.copilot.matches('/opt/homebrew/Caskroom/copilot-cli/1.0.60/copilot')).toBe(true);
        expect(AGENTS.copilot.matches('node /repo/feature-cli-copilot-cli/script.js')).toBe(false);
    });

    it('includes Pi as a startable agent', () => {
        expect(AGENTS.pi.command).toBe('pi');
        expect(AGENTS.pi.matches('pi')).toBe(true);
        expect(AGENTS.pi.matches('/usr/local/bin/pi --model x')).toBe(true);
        expect(AGENTS.pi.matches('node /repo/feature-pi-adapter/script.js')).toBe(false);
    });

    it('includes Grok as a startable agent', () => {
        expect(AGENTS.grok_cli.command).toBe('grok');
        expect(AGENTS.grok_cli.matches('grok')).toBe(true);
        expect(AGENTS.grok_cli.matches('/Users/dev/.grok/bin/grok --always-approve')).toBe(true);
        expect(AGENTS.grok_cli.matches('node /repo/feature-grok-cli/script.js')).toBe(false);
    });
});
