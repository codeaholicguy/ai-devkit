import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CodexAdapter } from '../dist/index.js';

const sourcePath = process.argv[2];
if (!sourcePath) {
    console.error('Usage: npm run benchmark:conversation-tail -- <codex-session.jsonl>');
    process.exitCode = 1;
} else {
    const sourceStat = fs.statSync(sourcePath);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tail-benchmark-'));
    const fixturePath = path.join(tempDir, 'session.jsonl');

    try {
        fs.copyFileSync(sourcePath, fixturePath);
        const legacy = new CodexAdapter();
        legacy.getConversation(fixturePath);
        const fullRunsMs = [];
        let visibleMessages = 0;
        for (let index = 0; index < 5; index++) {
            const started = performance.now();
            visibleMessages = legacy.getConversation(fixturePath).length;
            fullRunsMs.push(performance.now() - started);
        }

        const incremental = new CodexAdapter();
        const initialStarted = performance.now();
        const initial = await incremental.getConversationTail(fixturePath, { limit: 20 });
        const initialMs = performance.now() - initialStarted;

        const handle = fs.openSync(fixturePath, 'r');
        const finalByte = Buffer.alloc(1);
        if (sourceStat.size > 0) fs.readSync(handle, finalByte, 0, 1, sourceStat.size - 1);
        fs.closeSync(handle);
        const separator = sourceStat.size > 0 && finalByte[0] !== 0x0a ? '\n' : '';
        const appended = `${separator}${JSON.stringify({
            timestamp: new Date().toISOString(),
            type: 'event',
            payload: { type: 'agent_message', message: 'incremental-tail-benchmark' },
        })}\n`;
        fs.appendFileSync(fixturePath, appended);

        const appendStarted = performance.now();
        const append = await incremental.getConversationTail(fixturePath, { limit: 20 });
        const appendMs = performance.now() - appendStarted;
        const unchangedStarted = performance.now();
        const unchanged = await incremental.getConversationTail(fixturePath, { limit: 20 });
        const unchangedMs = performance.now() - unchangedStarted;

        const sorted = [...fullRunsMs].sort((a, b) => a - b);
        console.log(JSON.stringify({
            fixture: {
                bytes: sourceStat.size,
                mebibytes: Number((sourceStat.size / 1024 / 1024).toFixed(1)),
                visibleMessages,
            },
            legacyFullParse: {
                runsMs: fullRunsMs.map(value => Number(value.toFixed(1))),
                medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
            },
            incremental: {
                initialMs: Number(initialMs.toFixed(1)),
                initialStats: initial.stats,
                appendMs: Number(appendMs.toFixed(3)),
                appendStats: append.stats,
                unchangedMs: Number(unchangedMs.toFixed(3)),
                unchangedStats: unchanged.stats,
            },
        }, null, 2));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
