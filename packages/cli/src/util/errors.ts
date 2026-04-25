/**
 * Base error for the ai-devkit CLI.
 * All typed CLI errors extend this class, enabling programmatic
 * handling via error codes and structured details.
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CliError';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/** Thrown when a required config file is missing. */
export class ConfigNotFoundError extends CliError {
  constructor(message: string, configPath?: string) {
    super(message, 'CONFIG_NOT_FOUND', configPath ? { configPath } : undefined);
    this.name = 'ConfigNotFoundError';
  }
}

/** Thrown when user input or configuration values fail validation. */
export class ValidationError extends CliError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/** Thrown when a referenced resource (registry, skill, template) does not exist. */
export class NotFoundError extends CliError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

/** Thrown when a git or network operation fails. */
export class GitError extends CliError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GIT_ERROR', details);
    this.name = 'GitError';
  }
}

/**
 * Wraps a CLI command action with consistent error handling.
 * Catches errors, prints them via ui.error, and exits with code 1.
 */
export function withErrorHandler<T extends unknown[]>(
  label: string,
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error: unknown) {
      const { ui } = await import('./terminal-ui');
      const { getErrorMessage } = await import('./text');
      ui.error(`Failed to ${label}: ${getErrorMessage(error)}`);
      process.exit(1);
    }
  };
}
