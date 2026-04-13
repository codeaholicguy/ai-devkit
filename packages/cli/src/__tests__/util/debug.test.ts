import createDebug from 'debug';
import { createLogger, enableDebug } from '../../util/debug';

describe('debug utility', () => {
    afterEach(() => {
        createDebug.disable();
    });

    describe('createLogger()', () => {
        it('should create a logger with ai-devkit namespace prefix', () => {
            const logger = createLogger('channel');

            expect(logger.namespace).toBe('ai-devkit:channel');
        });

        it('should create loggers with different namespaces', () => {
            const channelLogger = createLogger('channel');
            const agentLogger = createLogger('agent');

            expect(channelLogger.namespace).toBe('ai-devkit:channel');
            expect(agentLogger.namespace).toBe('ai-devkit:agent');
        });

        it('should not output when debug is not enabled', () => {
            const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
            const logger = createLogger('channel');

            logger('test message');

            expect(stderrSpy).not.toHaveBeenCalled();
            stderrSpy.mockRestore();
        });

        it('should output when debug is enabled for its namespace', () => {
            createDebug.enable('ai-devkit:channel');
            const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
            const logger = createLogger('channel');

            logger('test message');

            expect(stderrSpy).toHaveBeenCalled();
            const output = stderrSpy.mock.calls[0][0] as string;
            expect(output).toContain('test message');
            stderrSpy.mockRestore();
        });
    });

    describe('enableDebug()', () => {
        it('should enable all ai-devkit namespaces', () => {
            enableDebug();

            const channelLogger = createLogger('channel');
            const agentLogger = createLogger('agent');

            expect(channelLogger.enabled).toBe(true);
            expect(agentLogger.enabled).toBe(true);
        });

        it('should not enable non-ai-devkit namespaces', () => {
            enableDebug();

            const otherLogger = createDebug('express:router');

            expect(otherLogger.enabled).toBe(false);
        });
    });
});
