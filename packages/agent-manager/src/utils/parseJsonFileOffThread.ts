import { Worker } from 'node:worker_threads';

const WORKER_SOURCE = `
const fs = require('node:fs');
const { parentPort, workerData } = require('node:worker_threads');
fs.promises.readFile(workerData.filePath, 'utf8')
  .then(content => parentPort.postMessage({ ok: true, value: JSON.parse(content) }))
  .catch(error => parentPort.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) }));
`;

/** Read and parse monolithic JSON without performing either operation on the caller's event loop. */
export function parseJsonFileOffThread<T>(filePath: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { filePath } });
        let settled = false;

        worker.once('message', (result: { ok: boolean; value?: T; message?: string }) => {
            settled = true;
            void worker.terminate();
            if (result.ok) resolve(result.value as T);
            else reject(new SyntaxError(result.message || 'Unable to parse JSON file'));
        });
        worker.once('error', (error) => {
            settled = true;
            reject(error);
        });
        worker.once('exit', (code) => {
            if (!settled) reject(new Error(`JSON parser worker exited before replying (code ${code})`));
        });
    });
}
