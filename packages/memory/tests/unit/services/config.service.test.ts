import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { readSemanticConfig } from '../../../src/services/config.service';

describe('memory semantic config', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-config-'));
    afterAll(() => rmSync(directory, { recursive: true, force: true }));

    it('defaults to disabled for missing or malformed config', () => {
        expect(readSemanticConfig(directory)).toEqual({ enabled: false });
        writeFileSync(join(directory, '.ai-devkit.json'), '{bad');
        expect(readSemanticConfig(directory)).toEqual({ enabled: false });
    });

    it('enables semantics only for an explicit true boolean', () => {
        writeFileSync(join(directory, '.ai-devkit.json'), JSON.stringify({ memory: { semantic: true } }));
        expect(readSemanticConfig(directory)).toEqual({ enabled: true });
        writeFileSync(join(directory, '.ai-devkit.json'), JSON.stringify({ memory: { semantic: 'true' } }));
        expect(readSemanticConfig(directory)).toEqual({ enabled: false });
    });
});
