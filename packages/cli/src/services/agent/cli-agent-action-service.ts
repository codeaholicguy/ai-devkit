import { select } from '@inquirer/prompts';
import {
    AgentManager,
    AgentRegistry,
    ClaudeCodeAdapter,
    ClaudePrintAgentService,
    CodexAdapter,
    CopilotAdapter,
    GeminiCliAdapter,
    GrokCliAdapter,
    OpenCodeAdapter,
    PiAdapter,
    PrintAgentStore,
    TerminalFocusManager,
    TmuxManager,
    TtyWriter,
    createAgentActionService,
    type AgentActionService,
} from '@ai-devkit/agent-manager';
import { createLogger, enableDebug } from '../../util/debug.js';
import { ui } from '../../util/terminal-ui.js';
import { createDefaultAgentGroupService } from './agent-group.service.js';
import { killAgent, sendToAgent, sendToAgentGroup, startAgent } from './agent.service.js';

export function createCliAgentManager(): AgentManager {
    const manager = new AgentManager(AgentRegistry.default());
    manager.registerAdapter(new ClaudeCodeAdapter());
    manager.registerAdapter(new CodexAdapter());
    manager.registerAdapter(new CopilotAdapter());
    manager.registerAdapter(new GeminiCliAdapter());
    manager.registerAdapter(new GrokCliAdapter());
    manager.registerAdapter(new OpenCodeAdapter());
    manager.registerAdapter(new PiAdapter());
    return manager;
}

export function createCliAgentActionService(debug = false): AgentActionService {
    if (debug) enableDebug();
    const logger = debug ? createLogger('terminal') : undefined;
    const registry = AgentRegistry.default();
    return createAgentActionService({
        manager: createCliAgentManager(),
        registry,
        tmux: new TmuxManager(),
        printService: new ClaudePrintAgentService({ store: new PrintAgentStore() }),
        reporter: ui,
        groupService: createDefaultAgentGroupService(),
        selectAgent: (options) => select(options),
        createFocusManager: () => new TerminalFocusManager(logger),
        startAgent,
        killAgent,
        sendToAgent: (options) => sendToAgent({ ...options, writer: TtyWriter.send }),
        sendToAgentGroup: (options) => sendToAgentGroup({ ...options, writer: TtyWriter.send }),
    });
}
