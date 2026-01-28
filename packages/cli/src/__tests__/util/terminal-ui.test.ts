import { ui } from '../../util/terminal-ui';

jest.mock('chalk', () => ({
    blue: (text: string) => `[BLUE]${text}[/BLUE]`,
    green: (text: string) => `[GREEN]${text}[/GREEN]`,
    yellow: (text: string) => `[YELLOW]${text}[/YELLOW]`,
    red: (text: string) => `[RED]${text}[/RED]`,
    cyan: (text: string) => `[CYAN]${text}[/CYAN]`,
}));

const mockOraInstance = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    text: '',
    isSpinning: false,
};

jest.mock('ora', () => {
    return jest.fn(() => mockOraInstance);
});

describe('TerminalUI', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        jest.clearAllMocks();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('info()', () => {
        it('should display blue info message with ℹ symbol', () => {
            ui.info('Test info message');

            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[BLUE]ℹ[/BLUE]',
                'Test info message'
            );
        });

        it('should sanitize ANSI escape codes', () => {
            ui.info('Test \x1b[31mwith color\x1b[0m message');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[BLUE]ℹ[/BLUE]',
                'Test with color message'
            );
        });

        it('should handle empty strings', () => {
            ui.info('');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[BLUE]ℹ[/BLUE]',
                ''
            );
        });
    });

    describe('success()', () => {
        it('should display green success message with ✔ symbol', () => {
            ui.success('Test success message');

            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[GREEN]✔[/GREEN]',
                'Test success message'
            );
        });

        it('should sanitize ANSI escape codes', () => {
            ui.success('Test \x1b[31mwith color\x1b[0m message');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[GREEN]✔[/GREEN]',
                'Test with color message'
            );
        });
    });

    describe('warning()', () => {
        it('should display yellow warning message with ⚠ symbol', () => {
            ui.warning('Test warning message');

            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[YELLOW]⚠[/YELLOW]',
                'Test warning message'
            );
        });

        it('should sanitize ANSI escape codes', () => {
            ui.warning('Test \x1b[31mwith color\x1b[0m message');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[YELLOW]⚠[/YELLOW]',
                'Test with color message'
            );
        });
    });

    describe('error()', () => {
        it('should display red error message with ✖ symbol', () => {
            ui.error('Test error message');

            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[RED]✖[/RED]',
                'Test error message'
            );
        });

        it('should use console.error instead of console.log', () => {
            ui.error('Test error');

            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(consoleLogSpy).not.toHaveBeenCalled();
        });

        it('should sanitize ANSI escape codes', () => {
            ui.error('Test \x1b[31mwith color\x1b[0m message');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[RED]✖[/RED]',
                'Test with color message'
            );
        });
    });

    describe('spinner()', () => {
        it('should create ora spinner with correct options', () => {
            const ora = require('ora');

            const spinner = ui.spinner('Loading...');

            expect(ora).toHaveBeenCalledWith({
                text: 'Loading...',
                color: 'cyan',
            });
            expect(spinner).toBe(mockOraInstance);
        });

        it('should sanitize text in spinner', () => {
            const ora = require('ora');

            ui.spinner('Loading \x1b[31mwith color\x1b[0m...');

            expect(ora).toHaveBeenCalledWith({
                text: 'Loading with color...',
                color: 'cyan',
            });
        });

        it('should return spinner with lifecycle methods', () => {
            const spinner = ui.spinner('Test');

            expect(spinner).toHaveProperty('start');
            expect(spinner).toHaveProperty('succeed');
            expect(spinner).toHaveProperty('fail');
            expect(spinner).toHaveProperty('warn');
            expect(spinner).toHaveProperty('stop');
        });
    });

    describe('Edge cases', () => {
        it('should handle very long messages', () => {
            const longMessage = 'a'.repeat(1000);
            ui.info(longMessage);

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[BLUE]ℹ[/BLUE]',
                longMessage
            );
        });

        it('should handle messages with newlines', () => {
            ui.info('Line 1\nLine 2\nLine 3');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[BLUE]ℹ[/BLUE]',
                'Line 1\nLine 2\nLine 3'
            );
        });

        it('should handle messages with special Unicode characters', () => {
            ui.info('Test with emoji 🎉 and symbols ©®™');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[BLUE]ℹ[/BLUE]',
                'Test with emoji 🎉 and symbols ©®™'
            );
        });

        it('should handle multiple ANSI escape codes', () => {
            ui.info('\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[BLUE]ℹ[/BLUE]',
                'Red Green Blue'
            );
        });
    });

    describe('Rapid successive calls', () => {
        it('should handle 100+ rapid calls without issues', () => {
            for (let i = 0; i < 100; i++) {
                ui.info(`Message ${i}`);
            }

            expect(consoleLogSpy).toHaveBeenCalledTimes(100);
        });

        it('should handle mixed message types rapidly', () => {
            for (let i = 0; i < 25; i++) {
                ui.info(`Info ${i}`);
                ui.success(`Success ${i}`);
                ui.warning(`Warning ${i}`);
                ui.error(`Error ${i}`);
            }

            expect(consoleLogSpy).toHaveBeenCalledTimes(75);
            expect(consoleErrorSpy).toHaveBeenCalledTimes(25);
        });
    });
});
