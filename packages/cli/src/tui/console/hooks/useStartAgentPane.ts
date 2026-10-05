import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { StartableAgentType } from "@ai-devkit/agent-manager";
import { runAction } from "../actions/runAction.js";
import { generateAgentName } from "../../../util/agent.js";
import type { ConsoleFocus, RightPaneMode, TransientMessage } from "../types.js";

type StartDefaults = { name: string; cwd: string };

interface UseStartAgentPaneOptions {
  refresh: () => Promise<void>;
  setFocus: Dispatch<SetStateAction<ConsoleFocus>>;
  setRightPaneMode: Dispatch<SetStateAction<RightPaneMode>>;
  setTransient: Dispatch<SetStateAction<TransientMessage | null>>;
}

interface StartAgentValues {
  type: StartableAgentType;
  name: string;
  cwd: string;
}

function createStartDefaults(): StartDefaults {
  const cwd = process.cwd();
  return { name: generateAgentName(cwd), cwd };
}

export function useStartAgentPane({
  refresh,
  setFocus,
  setRightPaneMode,
  setTransient,
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
        { type: "start", agentType: values.type, name: values.name, cwd: values.cwd },
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
          setRightPaneMode({ type: "preview" });
          setTransient({ kind: "info", text: `Started ${values.name}` });
          await refresh();
        })
        .finally(() => {
          startAbortRef.current = null;
          setIsStartingAgent(false);
        });
    },
    [isStartingAgent, refresh, setRightPaneMode, setTransient],
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
