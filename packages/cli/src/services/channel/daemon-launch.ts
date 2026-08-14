import path from 'path';
import { fileURLToPath } from 'url';
import type { DaemonLaunch } from '@ai-devkit/channel-connector';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export function resolveDaemonLaunch(): DaemonLaunch {
    if (path.extname(filename) === '.ts') {
        return {
            command: process.execPath,
            args: [
                '--no-warnings',
                '--loader',
                'ts-node/esm',
                path.resolve(dirname, '..', '..', 'channel-daemon.ts'),
            ],
            cwd: process.cwd(),
        };
    }
    return {
        command: process.execPath,
        args: [path.resolve(dirname, '..', '..', 'channel-daemon.js')],
        cwd: process.cwd(),
    };
}
