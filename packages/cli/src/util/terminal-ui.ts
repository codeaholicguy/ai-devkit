import chalk from 'chalk';
import ora from 'ora';

/**
 * Sanitize message to prevent terminal injection
 * Removes ANSI escape codes from user-provided strings
 */
const sanitize = (message: string): string => {
    // eslint-disable-next-line no-control-regex
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
     * Display a text line
     * @param text - The text to display
     */
    text: (text: string, { breakline = false }: { breakline?: boolean } = { breakline: false }): void => {
        console.log(`${breakline ? '\n' : ''}${text}${breakline ? '\n' : ''}`);
    },

    /**
     * Display a break line
     */
    breakline: (): void => {
        console.log('\n');
    },

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

    /**
     * Display a formatted table with headers and rows
     * @param options - Table configuration
     * @example
     * ```typescript
     * ui.table({
     *   headers: ['Name', 'Status', 'Type'],
     *   rows: [
     *     ['skill-1', 'active', 'frontend'],
     *     ['skill-2', 'inactive', 'backend']
     *   ],
     *   columnStyles: [chalk.cyan, chalk.green, chalk.dim]
     * });
     * ```
     */
    table: (options: {
        headers: string[];
        rows: string[][];
        columnStyles?: Array<(text: string) => string>;
        indent?: string;
    }): void => {
        const { headers, rows, columnStyles = [], indent = '  ' } = options;

        const columnWidths = headers.map((header, i) => {
            const maxDataWidth = Math.max(...rows.map(row => (row[i] || '').length));
            return Math.max(header.length, maxDataWidth);
        });

        const headerRow = headers.map((header, i) => {
            const style = columnStyles[i] || chalk.bold;
            return style(header.padEnd(columnWidths[i] + 2));
        }).join('');
        console.log(chalk.dim(indent) + headerRow);

        const totalWidth = columnWidths.reduce((sum, width) => sum + width + 2, 0);
        console.log(chalk.dim(indent + '─'.repeat(totalWidth)));

        rows.forEach(row => {
            const formattedRow = row.map((cell, i) => {
                const style = columnStyles[i] || ((text: string) => text);
                return style((cell || '').padEnd(columnWidths[i] + 2));
            }).join('');
            console.log(indent + formattedRow);
        });
    },

    /**
     * Display a summary section with title and items
     * @param options - Summary configuration
     * @example
     * ```typescript
     * ui.summary({
     *   title: 'Update Summary',
     *   items: [
     *     { type: 'success', count: 5, label: 'updated' },
     *     { type: 'warning', count: 2, label: 'skipped' },
     *     { type: 'error', count: 1, label: 'failed' }
     *   ],
     *   details: {
     *     title: 'Errors',
     *     items: [
     *       { message: 'Failed to update registry-1', tip: 'Check network connection' }
     *     ]
     *   }
     * });
     * ```
     */
    summary: (options: {
        title?: string;
        items: Array<{
            type: 'success' | 'warning' | 'error' | 'info';
            count: number;
            label: string;
        }>;
        details?: {
            title: string;
            items: Array<{
                message: string;
                tip?: string;
            }>;
        };
    }): void => {
        const { title = 'Summary', items, details } = options;

        console.log(chalk.bold(`\n\n${title}:`));

        items.forEach(item => {
            if (item.count > 0) {
                const symbol = item.type === 'success' ? '✓' :
                    item.type === 'warning' ? '⊘' :
                        item.type === 'error' ? '✗' : 'ℹ';

                const color = item.type === 'success' ? chalk.green :
                    item.type === 'warning' ? chalk.yellow :
                        item.type === 'error' ? chalk.red : chalk.blue;

                console.log(color(`  ${symbol} ${item.count} ${item.label}`));
            }
        });

        if (details && details.items.length > 0) {
            console.log(chalk.bold(`\n\n${details.title}:`));

            details.items.forEach(item => {
                console.log(chalk.red(`  • ${item.message}`));

                if (item.tip) {
                    console.log(chalk.dim(`    Tip: ${item.tip}`));
                }
            });
        }
    },
};
