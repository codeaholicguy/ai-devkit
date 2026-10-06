import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { StartableAgentType } from "@ai-devkit/agent-manager";
import { runAction } from "../actions/runAction.js";
import { generateAgentName } from "../../../util/agent.js";
import type { ConsoleFocus, RightPaneMode, TransientMessage } from "../types.js";

type StartDefaults = { type: StartableAgentType; name: string; cwd: string };

// Remembered across pane opens for the lifetime of the console session.
let lastUsedStart: { type: StartableAgentType; cwd: string } | null = null;

export function rememberStartDefaults(values: { type: StartableAgentType; cwd: string }): void {
  lastUsedStart = { type: values.type, cwd: values.cwd };
}

export function clearRememberedStartDefaults(): void {
  lastUsedStart = null;
}

interface UseStartAgentPaneOptions {
  refresh: () => Promise<void>;
  setFocus: Dispatch<SetStateAction<ConsoleFocus>>;
  setRightPaneMode: Dispatch<SetStateAction<RightPaneMode>>;
  setTransient: Dispatch<SetStateAction<TransientMessage | null>>;
  selectAgent: (name: string) => void;
}

interface StartAgentValues {
  type: StartableAgentType;
  name: string;
  cwd: string;
  mode?: "interactive" | "durable";
  prompt?: string;
  args?: string[];
}

export function createStartDefaults(): StartDefaults {
  const cwd = lastUsedStart?.cwd ?? process.cwd();
  return { type: lastUsedStart?.type ?? "codex", name: generateAgentName(cwd), cwd };
}

export function useStartAgentPane({
  refresh,
  setFocus,
  setRightPaneMode,
  setTransient,
  selectAgent,
}: UseStartAgentPaneOptions) {
  const [startPaneError, setStartPaneError] = useState<string | null>(null);
  const [isStartingAgent, setIsStartingAgent] = useState(false);
  const [startDefaults, setStartDefaults] = useState<StartDefaults>(createStartDefaults);
  const startAbortRef = useRef<AbortController | null>(null);

  const openStartPane = useCallback(() => {
    setStartDefaults(createStartDefaults());
    setStartPaneError(null);
    setFocus("list");
    setRightPaneMode({ type: "start-agent" });
  }, [setFocus, setRightPaneMode]);

  const handleStartCancel = useCallback(() => {
    if (isStartingAgent) {
      startAbortRef.current?.abort();
      return;
    }
    setRightPaneMode({ type: "preview" });
    setStartPaneError(null);
  }, [isStartingAgent, setRightPaneMode]);

  const handleStartSubmit = useCallback(
    (values: StartAgentValues) => {
      if (isStartingAgent) return;
      const abort = new AbortController();
      startAbortRef.current = abort;
      setIsStartingAgent(true);
      setStartPaneError(null);
      void runAction(
        {
          type: "start",
          agentType: values.type,
          name: values.name,
          cwd: values.cwd,
          mode: values.mode,
          args: values.args,
        },
        { signal: abort.signal },
      )
        .then(async (result) => {
          if (result.cancelled) {
            setRightPaneMode({ type: "preview" });
            setTransient({ kind: "info", text: `Start ${values.name} cancelled` });
            return;
          }
          if (result.error || (result.exitCode !== 0 && result.exitCode !== null)) {
            setStartPaneError(result.error ?? `start exited ${result.exitCode}`);
            return;
          }
          rememberStartDefaults({ type: values.type, cwd: values.cwd });
          setRightPaneMode({ type: "preview" });
          setTransient({ kind: "info", text: `Started ${values.name}` });
          await refresh();
          selectAgent(values.name);
          const prompt = values.prompt?.trim();
          if (prompt) {
            const sendResult = await runAction({
              type: "send",
              agentName: values.name,
              message: prompt,
            });
            if (sendResult.error || (sendResult.exitCode !== 0 && sendResult.exitCode !== null)) {
              setTransient({
                kind: "error",
                text: sendResult.error ?? `send exited ${sendResult.exitCode}`,
              });
            }
          }
        })
        .finally(() => {
          startAbortRef.current = null;
          setIsStartingAgent(false);
        });
    },
    [isStartingAgent, refresh, selectAgent, setRightPaneMode, setTransient],
  );

  return {
    startDefaults,
    startPaneError,
    isStartingAgent,
    openStartPane,
    handleStartCancel,
    handleStartSubmit,
  };
}
