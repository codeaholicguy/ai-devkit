import { describe, expect, it } from 'vitest';
import { probeClaudeCapacity, readClaudeAuthStatus } from '../../../commands/capacity/providers/claude.js';
import { probePiCapacity } from '../../../commands/capacity/providers/pi.js';
import { buildUnsupportedCapacity } from '../../../commands/capacity/providers/stub.js';

const checkedAt = '2026-08-09T10:00:00.000Z';

describe('non-Codex capacity adapters', () => {
  it('reads logged-out Claude JSON even when the CLI exits nonzero', async () => {
    const execute = async () => {
      throw Object.assign(new Error('must not leak'), {
        stdout: JSON.stringify({ loggedIn: false, subscriptionType: null }),
        stderr: 'credential-bearing stderr must not leak'
      });
    };

    await expect(readClaudeAuthStatus(6000, execute)).resolves.toEqual({
      loggedIn: false, subscriptionType: null
    });
  });

  it('detects Claude authentication but keeps undocumented live usage guarded off', async () => {
    let receivedTimeout = 0;
    const result = await probeClaudeCapacity({
      configured: true,
      installed: true,
      checkedAt,
      authStatus: async timeoutMs => {
        receivedTimeout = timeoutMs;
        return { loggedIn: true, subscriptionType: 'max' };
      }
    });
    expect(receivedTimeout).toBe(6000);

    expect(result).toMatchObject({
      provider: 'claude', authenticated: true, status: 'supported',
      available: 'unknown', plan: 'max', source: 'provider-cli'
    });
    expect(result.warnings[0].code).toBe('live-usage-unavailable');
  });

  it('redacts Claude authentication failures', async () => {
    const result = await probeClaudeCapacity({
      configured: true,
      installed: true,
      checkedAt,
      authStatus: async () => { throw new Error('oauth-token secret response body'); }
    });

    expect(result.authenticated).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/oauth-token|secret|response body/);
  });

  it('does not expose unexpected Claude subscription metadata', async () => {
    const result = await probeClaudeCapacity({
      configured: true,
      installed: true,
      checkedAt,
      authStatus: async () => ({ loggedIn: true, subscriptionType: 'token_secret_1234567890' })
    });

    expect(result.plan).toBeNull();
    expect(JSON.stringify(result)).not.toContain('token_secret_1234567890');
  });

  it('detects Pi and GLM authentication only from provider key names', async () => {
    const results = await probePiCapacity({
      configured: true,
      installed: true,
      checkedAt,
      readAuth: async () => JSON.stringify({ zai: { type: 'api_key', key: 'must-not-leak' } })
    });

    expect(results.map(result => result.provider)).toEqual(['pi', 'glm']);
    expect(results.every(result => result.authenticated === true)).toBe(true);
    expect(results.every(result => result.available === 'unknown')).toBe(true);
    expect(JSON.stringify(results)).not.toContain('must-not-leak');
  });

  it('returns truthful unknown capacity for other configured providers', () => {
    expect(buildUnsupportedCapacity('gemini', {
      configured: true, installed: false, checkedAt
    })).toMatchObject({
      provider: 'gemini', configured: true, installed: false,
      agentType: 'gemini_cli', authenticated: null, status: 'unsupported',
      available: 'unknown', source: 'none'
    });
    expect(buildUnsupportedCapacity('copilot', {
      configured: true, installed: true, checkedAt
    }).agentType).toBe('copilot');
  });
});
