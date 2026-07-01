import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts', 'src/**/*.d.ts', 'src/types/**'],
            thresholds: {
                branches: 75,
                functions: 75,
                lines: 75,
                statements: 75,
            },
        },
    },
});
