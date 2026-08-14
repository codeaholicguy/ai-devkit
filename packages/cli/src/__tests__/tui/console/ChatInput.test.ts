import { PassThrough } from 'node:stream';
import { createElement } from 'react';
import { render } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../../../tui/console/ChatInput.js';

class TestInputStream extends PassThrough {
    isTTY = true;
    setRawMode = vi.fn();
    ref = vi.fn(() => this);
    unref = vi.fn(() => this);
}

class TestOutputStream extends PassThrough {
    isTTY = true;
    columns = 80;
    rows = 24;
}

describe('ChatInput', () => {
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        for (const cleanup of cleanups.splice(0)) cleanup();
    });

    it('updates while typing without rendering its parent again', async () => {
        let parentRenderCount = 0;
        const Parent = () => {
            parentRenderCount += 1;
            return createElement(ChatInput, {
                focused: true,
                onSubmit: vi.fn(),
                onCancel: vi.fn(),
                innerWidth: 60,
                onLineCountChange: vi.fn(),
            });
        };

        const { stdin, output, instance } = mount(createElement(Parent));
        await type(stdin, instance, 'a', 'b', 'c');

        expect(output.join('')).toContain('abc');
        expect(parentRenderCount).toBe(1);
    });

    it('trims submitted messages and clears after submit', async () => {
        const onSubmit = vi.fn();
        const onCancel = vi.fn();
        const { stdin, instance } = mount(createChatInput({ onSubmit, onCancel }));

        await type(stdin, instance, '  hello  ', '\r');

        expect(onSubmit).toHaveBeenCalledWith('hello');
        expect(onCancel).not.toHaveBeenCalled();

        await type(stdin, instance, '\r');
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('cancels an empty submission', async () => {
        const onSubmit = vi.fn();
        const onCancel = vi.fn();
        const { stdin, instance } = mount(createChatInput({ onSubmit, onCancel }));

        await type(stdin, instance, '   ', '\r');

        expect(onSubmit).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('clears the draft when focus is lost', async () => {
        const onSubmit = vi.fn();
        const onCancel = vi.fn();
        const props = { onSubmit, onCancel };
        const { stdin, instance } = mount(createChatInput(props));
        await type(stdin, instance, 'draft');

        instance.rerender(createChatInput({ ...props, focused: false }));
        await instance.waitUntilRenderFlush();
        instance.rerender(createChatInput(props));
        await instance.waitUntilRenderFlush();
        await type(stdin, instance, '\r');

        expect(onSubmit).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('reports line-count changes as the local value wraps', async () => {
        const onLineCountChange = vi.fn();
        const { stdin, instance } = mount(createChatInput({
            innerWidth: 6,
            onLineCountChange,
        }));

        await type(stdin, instance, 'abcdefgh');

        expect(onLineCountChange).toHaveBeenLastCalledWith(3);
    });

    it('preserves cursor editing keyboard behavior', async () => {
        const onSubmit = vi.fn();
        const { stdin, instance } = mount(createChatInput({ onSubmit }));

        await type(stdin, instance, 'ac', '\u001B[D', 'b', '\r');

        expect(onSubmit).toHaveBeenCalledWith('abc');
    });

    function createChatInput(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
        return createElement(ChatInput, {
            focused: true,
            onSubmit: vi.fn(),
            onCancel: vi.fn(),
            innerWidth: 60,
            onLineCountChange: vi.fn(),
            ...overrides,
        });
    }

    function mount(element: ReturnType<typeof createElement>) {
        const stdin = new TestInputStream();
        const stdout = new TestOutputStream();
        const output: string[] = [];
        stdout.on('data', chunk => output.push(chunk.toString()));
        const instance = render(element, {
            stdin: stdin as NodeJS.ReadStream,
            stdout: stdout as NodeJS.WriteStream,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false,
            interactive: true,
        });
        cleanups.push(instance.cleanup);
        return { stdin, output, instance };
    }

    async function type(
        stdin: TestInputStream,
        instance: ReturnType<typeof render>,
        ...keys: string[]
    ): Promise<void> {
        await instance.waitUntilRenderFlush();
        for (const key of keys) {
            stdin.write(key);
            await instance.waitUntilRenderFlush();
        }
    }
});
