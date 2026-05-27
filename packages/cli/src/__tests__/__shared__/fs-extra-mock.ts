import { vi } from 'vitest';

const methods = [
    'pathExists', 'readJson', 'writeJson', 'readFile', 'writeFile',
    'ensureDir', 'ensureFile', 'readdir', 'stat', 'copy', 'copyFile',
    'remove', 'move', 'outputFile', 'outputJson', 'emptyDir',
    'existsSync', 'mkdir', 'readFileSync', 'writeFileSync', 'readdirSync',
    'statSync',
] as const;

export function makeFsExtraMock() {
    const mocks: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of methods) mocks[m] = vi.fn();
    return { ...mocks, default: mocks };
}
