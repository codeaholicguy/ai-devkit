import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts', 'src/**/*.d.ts', 'src/types.ts'],
            thresholds: {
                branches: 75,
                functions: 75,
                lines: 75,
                statements: 75,
            },
        },
    },
});
