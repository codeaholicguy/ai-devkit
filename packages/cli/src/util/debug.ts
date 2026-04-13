import createDebug from 'debug';

const APP_NAME = 'ai-devkit';

/**
 * Create a namespaced debug logger.
 *
 * Usage:
 *   import { createLogger } from '../util/debug';
 *   const debug = createLogger('channel');
 *   debug('message');  // prints: ai-devkit:channel message
 *
 * Enable via:
 *   --debug flag (enables ai-devkit:*)
 *   DEBUG=ai-devkit:* env var
 *   DEBUG=ai-devkit:channel env var (specific namespace)
 */
export function createLogger(namespace: string): createDebug.Debugger {
    return createDebug(`${APP_NAME}:${namespace}`);
}

/**
 * Enable all ai-devkit debug loggers programmatically.
 * Called from the CLI entry point when --debug is passed.
 */
export function enableDebug(): void {
    createDebug.enable(`${APP_NAME}:*`);
}
