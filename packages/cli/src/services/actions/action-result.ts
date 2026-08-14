export interface ApplicationActionResult {
    ok: boolean;
    message?: string;
    cliExitCode?: number;
}

export const actionSucceeded = (): ApplicationActionResult => ({ ok: true });

export const actionFailed = (
    message: string,
    cliExitCode?: number,
): ApplicationActionResult => ({ ok: false, message, cliExitCode });
