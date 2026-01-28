import chalk from 'chalk';

const ora = require('ora');

/**
 * Sanitize message to prevent terminal injection
 * Removes ANSI escape codes from user-provided strings
 */
const sanitize = (message: string): string => {
    return message.replace(/\x1b\[[0-9;]*m/g, '');
};

/**
 * Terminal UI utility for consistent message formatting across CLI commands
 * 
 * @example
 * ```typescript
 * import { ui } from '../util/terminal-ui';
 * 
 * // Display messages
 * ui.info('Initializing project...');
 * ui.success('Project initialized successfully!');
 * ui.warning('Configuration file not found, using defaults');
 * ui.error('Failed to create directory');
 * 
 * // Use spinner for async operations
 * const spinner = ui.spinner('Cloning repository...');
 * spinner.start();
 * try {
 *   await cloneRepo();
 *   spinner.succeed('Repository cloned successfully');
 * } catch (error) {
 *   spinner.fail('Failed to clone repository');
 *   ui.error(error.message);
 * }
 * ```
 */
export const ui = {
    /**
     * Display informational message (blue)
     * @param message - The message to display
     */
    info: (message: string): void => {
        console.log(chalk.blue('ℹ'), sanitize(message));
    },

    /**
     * Display success message (green)
     * @param message - The message to display
     */
    success: (message: string): void => {
        console.log(chalk.green('✔'), sanitize(message));
    },

    /**
     * Display warning message (yellow)
     * @param message - The message to display
     */
    warning: (message: string): void => {
        console.log(chalk.yellow('⚠'), sanitize(message));
    },

    /**
     * Display error message (red)
     * @param message - The message to display
     */
    error: (message: string): void => {
        console.error(chalk.red('✖'), sanitize(message));
    },

    /**
     * Create a spinner for async operations
     * @param text - The text to display with the spinner
     * @returns Ora spinner instance with start/succeed/fail/warn/stop methods
     */
    spinner: (text: string) => {
        return ora({
            text: sanitize(text),
            color: 'cyan',
        });
    },
};
