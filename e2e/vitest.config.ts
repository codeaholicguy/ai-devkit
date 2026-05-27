import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.e2e.ts'],
        testTimeout: 30000,
    },
});
