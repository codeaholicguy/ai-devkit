import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/cli.ts', 'src/**/*.d.ts', 'src/types.ts', 'src/**/types.ts'],
            thresholds: {
                branches: 60,
                functions: 60,
                lines: 60,
                statements: 60,
            },
        },
    },
});
