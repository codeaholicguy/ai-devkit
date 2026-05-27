import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import { loadConfigFile } from '../../../services/config/config.service.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });

describe('config service', () => {
  const mockedFs = fs as Mocked<typeof fs>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads config file from disk', async () => {
    (mockedFs.pathExists as any).mockResolvedValue(true);
    (mockedFs.readJson as any).mockResolvedValue({ environments: ['codex'] });

    const result = await loadConfigFile('.ai-devkit.json');

    expect(result.configPath).toContain('.ai-devkit.json');
    expect(result.data).toEqual({ environments: ['codex'] });
  });

  it('throws when config file does not exist', async () => {
    (mockedFs.pathExists as any).mockResolvedValue(false);

    await expect(loadConfigFile('.ai-devkit.json')).rejects.toThrow('Config file not found');
  });

  it('throws when config JSON is invalid', async () => {
    (mockedFs.pathExists as any).mockResolvedValue(true);
    (mockedFs.readJson as any).mockRejectedValue(new Error('Unexpected token }'));

    await expect(loadConfigFile('.ai-devkit.json')).rejects.toThrow('Invalid JSON in config file');
  });
});
