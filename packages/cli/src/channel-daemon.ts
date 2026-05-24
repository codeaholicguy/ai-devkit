#!/usr/bin/env node

import { enableDebug } from './util/debug';
import { getErrorMessage } from './util/text';
import { ui } from './util/terminal-ui';
import { runChannelBridge } from './services/channel/channel-runner';

interface DaemonArgs {
    channelName?: string;
    agentName?: string;
    debug?: boolean;
}

function readOption(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    return args[index + 1];
}

function parseArgs(args: string[]): DaemonArgs {
    return {
        channelName: readOption(args, '--channel'),
        agentName: readOption(args, '--agent'),
        debug: args.includes('--debug'),
    };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    if (args.debug) {
        enableDebug();
    }

    if (!args.channelName || !args.agentName) {
        throw new Error('Channel daemon requires --channel <name> and --agent <name>.');
    }

    await runChannelBridge({
        channelName: args.channelName,
        agentName: args.agentName,
    });
}

main().catch((error: unknown) => {
    ui.error(getErrorMessage(error));
    process.exit(1);
});
