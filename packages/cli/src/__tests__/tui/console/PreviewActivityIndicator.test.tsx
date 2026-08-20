import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, renderToString } from 'ink';
import { PassThrough } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import * as activity from '../../../tui/console/PreviewActivityIndicator.js';

const originalTerm = process.env.TERM;

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalTerm === undefined) delete process.env.TERM;
    else process.env.TERM = originalTerm;
});

describe('preview activity frames', () => {
    it('cycles through every braille frame and wraps to the beginning', () => {
        const getFrame = Reflect.get(activity, 'getPreviewActivityFrame') as
            ((frameIndex: number, term?: string) => string) | undefined;

        expect(getFrame).toBeTypeOf('function');
        expect(Array.from({ length: 9 }, (_, index) => getFrame?.(index))).toEqual([
            '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠋',
        ]);
    });

    it('uses fixed-width ASCII frames for TERM=dumb', () => {
        const getFrame = activity.getPreviewActivityFrame as
            (frameIndex: number, term?: string) => string;
        const frames = Array.from({ length: 5 }, (_, index) => getFrame(index, 'dumb'));

        expect(frames).toEqual(['|', '/', '-', '\\', '|']);
        expect(frames.every(frame => /^[\x00-\x7F]$/u.test(frame))).toBe(true);
    });
});

describe('PreviewActivityIndicator', () => {
    it('renders the TERM=dumb ASCII fallback and hides while inactive', () => {
        process.env.TERM = 'dumb';

        const active = stripVTControlCharacters(renderToString(
            React.createElement(activity.PreviewActivityIndicator, { active: true }),
        ));
        const inactive = renderToString(
            React.createElement(activity.PreviewActivityIndicator, { active: false }),
        );

        expect(active).toContain('| working');
        expect(active).not.toMatch(/[^\x00-\x7F]/u);
        expect(inactive).toBe('');
    });

    it('advances to the next frame every 160 ms', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        Object.assign(stdout, { columns: 80, rows: 24, isTTY: true });
        let output = '';
        const originalWrite = stdout.write.bind(stdout);
        vi.spyOn(stdout, 'write').mockImplementation(((...args: Parameters<typeof stdout.write>) => {
            output += args[0].toString();
            return originalWrite(...args);
        }) as typeof stdout.write);
        const instance = render(React.createElement(activity.PreviewActivityIndicator, { active: true }), {
            stdout,
            interactive: true,
            patchConsole: false,
        });
        await instance.waitUntilRenderFlush();
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(stripVTControlCharacters(output)).toContain('⠋ working');

        await vi.advanceTimersByTimeAsync(160);
        await instance.waitUntilRenderFlush();

        expect(stripVTControlCharacters(output)).toContain('⠙ working');
        instance.unmount();
        vi.useRealTimers();
        await instance.waitUntilExit();
    });

    it('cleans up its timer on deactivation and unmount', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const instance = render(React.createElement(activity.PreviewActivityIndicator, { active: true }), {
            stdout,
            interactive: false,
            patchConsole: false,
        });
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(vi.getTimerCount()).toBe(1);

        instance.rerender(React.createElement(activity.PreviewActivityIndicator, { active: false }));
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(vi.getTimerCount()).toBe(0);

        instance.rerender(React.createElement(activity.PreviewActivityIndicator, { active: true }));
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(vi.getTimerCount()).toBe(1);

        instance.unmount();
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
        await instance.waitUntilExit();
    });
});
