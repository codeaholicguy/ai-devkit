/**
 * Regression coverage for https://github.com/codeaholicguy/ai-devkit/issues/400
 *
 * `agent send --wait` immediately after `agent start` used to fail with
 * "No session file found" because a fresh agent only writes its session file
 * after its first message.
 *
 * A real `agent start` boot requires tmux plus a live harness binary, which is
 * too heavy for e2e CI. These tests instead drive the compiled `sendToAgent`
 * service with simulated collaborators: a scripted `listAgents` sequence
 * reproduces the "session file appears later" condition end-to-end through
 * the real send → poll → wait code path. The trade-off is that tmux delivery
 * and harness process detection are stubbed rather than real.
 */
import { join } from 'path';

// Compiled service under test (dist mirrors src layout).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendToAgent } = await import(
  join(__dirname, '..', 'packages', 'cli', 'dist', 'services', 'agent', 'agent.service.js')
);
const { AgentStatus } = await import('@ai-devkit/agent-manager');

interface FakeAgent {
  name: string;
  type: string;
  status: string;
  pid: number;
  sessionId: string;
  sessionFilePath?: string;
  lastActive: Date;
}

const BOOTING_AGENT: FakeAgent = {
  name: 'boot-agent',
  type: 'claude',
  status: AgentStatus.RUNNING,
  pid: 4242,
  sessionId: 'session-1',
  lastActive: new Date('2026-01-01T00:00:00.000Z'),
};

const READY_AGENT: FakeAgent = {
  ...BOOTING_AGENT,
  status: AgentStatus.WAITING,
  sessionFilePath: '/tmp/boot-agent-session.jsonl',
};

function makeHarness(listAgentsSequence: FakeAgent[][], conversations: object[][]) {
  const listAgentsCalls: number[] = [];
  let listIndex = 0;
  let convoIndex = 0;

  const adapter = {
    getConversation: () => conversations[Math.min(convoIndex++, conversations.length - 1)],
  };
  const manager = {
    listAgents: async () => {
      listAgentsCalls.push(1);
      return listAgentsSequence[Math.min(listIndex++, listAgentsSequence.length - 1)];
    },
    resolveAgent: () => BOOTING_AGENT,
    getAdapter: () => adapter,
  };
  return { manager, adapter, listAgentsCalls };
}

function makeRuntime(sent: string[]) {
  return {
    provider: 'tmux',
    send: async ({ prompt }: { prompt: string }) => {
      sent.push(prompt);
    },
    focus: async () => true,
    stop: async () => {},
  };
}

const silentReporter = { info: () => {}, warning: () => {}, success: () => {}, error: () => {} };

describe('agent send --wait session-file race (issue #400)', () => {
  it('sends the prompt, then waits for the session file to appear', async () => {
    const { manager } = makeHarness(
      [
        [BOOTING_AGENT], // initial resolution — no session file yet
        [BOOTING_AGENT], // first poll — still booting
        [READY_AGENT], // session file appeared after the send
        [READY_AGENT], // wait loop
      ],
      [
        [], // initial transcript read
        [{ role: 'assistant', content: 'hello back' }],
      ],
    );
    const sent: string[] = [];
    const assistantMessages: string[] = [];

    await sendToAgent({
      id: 'boot-agent',
      prompt: 'hello',
      manager,
      focusManager: { findTerminal: async () => ({ type: 'tmux', identifier: '0:1.0' }) },
      registry: { lookup: () => null },
      runtime: makeRuntime(sent),
      wait: true,
      timeout: '5000',
      reporter: silentReporter,
      writeWaitStatus: () => {},
      writeAssistantMessage: (message: { content: string }) => {
        assistantMessages.push(message.content);
      },
    });

    expect(sent).toEqual(['hello']);
    expect(assistantMessages).toEqual(['hello back']);
  });

  it('fails with a distinct error when the agent exits before creating a session file', async () => {
    const { manager } = makeHarness(
      [
        [BOOTING_AGENT], // initial resolution
        [], // agent process exited before the session file appeared
      ],
      [[]],
    );
    const sent: string[] = [];

    await expect(
      sendToAgent({
        id: 'boot-agent',
        prompt: 'hello',
        manager,
        focusManager: { findTerminal: async () => ({ type: 'tmux', identifier: '0:1.0' }) },
        registry: { lookup: () => null },
        runtime: makeRuntime(sent),
        wait: true,
        timeout: '5000',
        reporter: silentReporter,
        writeWaitStatus: () => {},
        writeAssistantMessage: () => {},
      }),
    ).rejects.toThrow('exited before creating a session file');
    expect(sent).toEqual(['hello']);
  });

  it('fails after the grace period when no session file ever appears', async () => {
    const { manager } = makeHarness(
      [[BOOTING_AGENT]], // never creates a session file
      [[]],
    );
    const sent: string[] = [];

    await expect(
      sendToAgent({
        id: 'boot-agent',
        prompt: 'hello',
        manager,
        focusManager: { findTerminal: async () => ({ type: 'tmux', identifier: '0:1.0' }) },
        registry: { lookup: () => null },
        runtime: makeRuntime(sent),
        wait: true,
        timeout: '150',
        reporter: silentReporter,
        writeWaitStatus: () => {},
        writeAssistantMessage: () => {},
      }),
    ).rejects.toThrow('did not create a session file within 150ms');
    expect(sent).toEqual(['hello']);
  });
});
