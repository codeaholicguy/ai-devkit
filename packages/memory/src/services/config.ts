import { readFileSync } from 'fs';
import { join } from 'path';

export interface SemanticConfig {
    enabled: boolean;
}

export function readSemanticConfig(directory = process.cwd()): SemanticConfig {
    try {
        const value = JSON.parse(readFileSync(join(directory, '.ai-devkit.json'), 'utf8')) as {
            memory?: { semantic?: unknown };
        };
        return { enabled: value.memory?.semantic === true };
    } catch {
        return { enabled: false };
    }
}
