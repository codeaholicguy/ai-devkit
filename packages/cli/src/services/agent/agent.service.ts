import {
  AgentStatus,
  type AgentAdapter,
  type AgentInfo,
  type AgentManager,
  type AgentType,
  type ConversationMessage,
} from '@ai-devkit/agent-manager';
import { sleep } from '../../util/time.js';

export interface AgentSendWaitTarget {
  id: string;
  name: string;
  type: AgentType;
  pid: number;
  sessionId: string;
  sessionFilePath: string;
}

export interface AgentSendWaitOptions {
  pollIntervalMs: number;
  maxWaitMs: number;
  timeoutLabel?: string;
}

export interface AgentSendWaitResult {
  agentName: string;
  agentType: AgentType;
  pid: number;
  sessionId: string;
  sessionFilePath: string;
  messages: ConversationMessage[];
  finalStatus: AgentStatus;
  elapsedMs: number;
}

export interface WaitForAgentResponseParams {
  manager: Pick<AgentManager, 'listAgents'>;
  adapter: Pick<AgentAdapter, 'getConversation'>;
  target: AgentSendWaitTarget;
  initialMessageCount: number;
  options: AgentSendWaitOptions;
  onAssistantMessage: (message: ConversationMessage) => void;
  onStatus?: (message: string) => void;
}

function findSameAgent(target: AgentSendWaitTarget, agents: AgentInfo[]): AgentInfo | undefined {
  return agents.find((agent) => agent.pid === target.pid)
    ?? agents.find((agent) => agent.sessionId === target.sessionId && agent.type === target.type);
}

function readNewAssistantMessages(
  adapter: Pick<AgentAdapter, 'getConversation'>,
  sessionFilePath: string,
  lastSeenCount: number,
): { messages: ConversationMessage[]; nextSeenCount: number } {
  const conversation = adapter.getConversation(sessionFilePath, { verbose: false });
  const newMessages = conversation.slice(lastSeenCount);
  const assistantMessages = newMessages.filter((message) => (
    message.role === 'assistant' && Boolean(message.content)
  ));

  return {
    messages: assistantMessages,
    nextSeenCount: conversation.length,
  };
}

export async function waitForAgentResponse(params: WaitForAgentResponseParams): Promise<AgentSendWaitResult> {
  const { manager, adapter, target, initialMessageCount, options, onAssistantMessage, onStatus } = params;
  const startedAt = Date.now();
  let lastSeenCount = initialMessageCount;
  const messages: ConversationMessage[] = [];

  while (Date.now() - startedAt < options.maxWaitMs) {
    let transcriptReadSucceeded = false;
    try {
      const read = readNewAssistantMessages(adapter, target.sessionFilePath, lastSeenCount);
      lastSeenCount = read.nextSeenCount;
      transcriptReadSucceeded = true;

      for (const message of read.messages) {
        messages.push(message);
        onAssistantMessage(message);
      }
    } catch {
      // Transcript files can be observed mid-write. Treat read failures as
      // transient while the status loop still has time to prove completion.
    }

    const agents = await manager.listAgents();
    const agent = findSameAgent(target, agents);
    if (!agent) {
      throw new Error(`Agent "${target.name}" is no longer running.`);
    }

    const hasAssistantOutput = messages.length > 0;
    const canCompleteOnStatus =
      agent.status === AgentStatus.WAITING ||
      (agent.status === AgentStatus.IDLE && hasAssistantOutput);

    if (canCompleteOnStatus && transcriptReadSucceeded) {
      if (messages.length === 0) {
        onStatus?.(`Agent "${target.name}" returned to waiting without assistant output.`);
      }

      return {
        agentName: target.name,
        agentType: target.type,
        pid: target.pid,
        sessionId: target.sessionId,
        sessionFilePath: target.sessionFilePath,
        messages,
        finalStatus: agent.status,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = options.maxWaitMs - elapsedMs;
    await sleep(Math.min(options.pollIntervalMs, remainingMs));
  }

  throw new Error(`Timed out waiting for agent "${target.name}" after ${options.timeoutLabel ?? `${options.maxWaitMs}ms`}.`);
}
