import {
    createAgentActionService,
    type AgentActionReporter,
    type ApplicationActionResult,
} from '@ai-devkit/agent-manager';
import {
    createChannelActionService,
    type ChannelActionReporter,
} from '@ai-devkit/channel-connector';
import { resolveDaemonLaunch } from '../../../services/channel/daemon-launch.js';
import type { ConsoleAction } from './types.js';

export interface ActionResult {
    exitCode: number | null;
    error?: string;
}

type StartAction = Extract<ConsoleAction, { type: 'start' }>;
type StartConsoleActionInput = Pick<StartAction, 'agentType' | 'name' | 'cwd'>;

export interface ConsoleActionServices {
    open(input: { agentName: string }): Promise<ApplicationActionResult>;
    send(input: { agentName: string; message: string }): Promise<ApplicationActionResult>;
    start(input: StartConsoleActionInput): Promise<ApplicationActionResult>;
    kill(input: { agentName: string }): Promise<ApplicationActionResult>;
    rename(input: { currentName: string; newName: string }): Promise<ApplicationActionResult>;
    startChannel(input: { channelName: string; agentName: string }): Promise<ApplicationActionResult>;
    stopChannel(input: { channelName: string }): Promise<ApplicationActionResult>;
}

function createDefaultConsoleActionServices(): ConsoleActionServices {
    const noOutput = () => undefined;
    const reporter: AgentActionReporter & ChannelActionReporter = {
        text: noOutput,
        info: noOutput,
        success: noOutput,
        warning: noOutput,
        error: noOutput,
        spinner: () => ({ start: noOutput, succeed: noOutput, fail: noOutput }),
    };
    const agent = createAgentActionService({ reporter });
    const channel = createChannelActionService({ reporter });
    return {
        open: ({ agentName }) => agent.open({ agentName }),
        send: ({ agentName, message }) => agent.send({ agentName, message }),
        start: ({ agentType, name, cwd }) => agent.start({
            agentType,
            mode: 'interactive',
            name,
            cwd,
        }),
        kill: ({ agentName }) => agent.kill({ agentName }),
        rename: ({ currentName, newName }) => agent.rename({ currentName, newName }),
        startChannel: ({ channelName, agentName }) => channel.startDaemon({
            channelName,
            agentName,
            launch: resolveDaemonLaunch(),
        }),
        stopChannel: ({ channelName }) => channel.stop({ channelName }),
    };
}

function toActionResult(result: ApplicationActionResult): ActionResult {
    return result.ok
        ? { exitCode: 0 }
        : { exitCode: result.cliExitCode ?? 1, error: result.message };
}

export async function runAction(
    action: ConsoleAction,
    services: ConsoleActionServices = createDefaultConsoleActionServices(),
): Promise<ActionResult> {
    try {
        switch (action.type) {
            case 'open':
                return toActionResult(await services.open({ agentName: action.agentName }));
            case 'send':
                return toActionResult(await services.send({ agentName: action.agentName, message: action.message }));
            case 'start':
                return toActionResult(await services.start({
                    agentType: action.agentType,
                    name: action.name,
                    cwd: action.cwd,
                }));
            case 'kill':
                return toActionResult(await services.kill({ agentName: action.agentName }));
            case 'rename':
                return toActionResult(await services.rename({
                    currentName: action.currentName,
                    newName: action.newName,
                }));
            case 'channel-start':
                return toActionResult(await services.startChannel({
                    channelName: action.channelName,
                    agentName: action.agentName,
                }));
            case 'channel-stop':
                return toActionResult(await services.stopChannel({ channelName: action.channelName }));
        }
    } catch (error) {
        return {
            exitCode: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
