import fs from "fs";
import os from "os";
import path from "path";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { HARNESS_RUNTIME_PROFILES, type StartableAgentType } from "@ai-devkit/agent-manager";
import { KeyHints, Panel, SectionTitle, TUI_COLORS } from "../design-system/index.js";
import { agentTypeLabel } from "../../util/agent.js";
import { commandExistsOnPath } from "../../util/executable.js";

export const STARTABLE_AGENT_TYPES = Object.keys(HARNESS_RUNTIME_PROFILES) as StartableAgentType[];

export function nextStartAgentType(type: StartableAgentType): StartableAgentType {
  const index = STARTABLE_AGENT_TYPES.indexOf(type);
  return STARTABLE_AGENT_TYPES[(index + 1) % STARTABLE_AGENT_TYPES.length];
}

export function previousStartAgentType(type: StartableAgentType): StartableAgentType {
  const index = STARTABLE_AGENT_TYPES.indexOf(type);
  return STARTABLE_AGENT_TYPES[
    (index - 1 + STARTABLE_AGENT_TYPES.length) % STARTABLE_AGENT_TYPES.length
  ];
}

export type AgentMode = "interactive" | "durable";

export const DURABLE_CAPABLE_TYPES: readonly StartableAgentType[] = ["claude", "codex", "pi"];

export function isModeAllowedForType(mode: AgentMode, type: StartableAgentType): boolean {
  return mode === "interactive" || DURABLE_CAPABLE_TYPES.includes(type);
}

export function nextAgentMode(mode: AgentMode, type: StartableAgentType): AgentMode {
  const next: AgentMode = mode === "interactive" ? "durable" : "interactive";
  return isModeAllowedForType(next, type) ? next : mode;
}

export function getStartTypeRows(selected: StartableAgentType): {
  marker: string;
  type: StartableAgentType;
}[] {
  return STARTABLE_AGENT_TYPES.map((type) => ({
    marker: type === selected ? "▶ " : "  ",
    type,
  }));
}

type Focus = "type" | "mode" | "cwd" | "name" | "prompt" | "args" | "submit" | "cancel";

interface StartAgentPaneProps {
  initialType?: StartableAgentType;
  initialName: string;
  initialCwd: string;
  recentCwds?: string[];
  onSubmit: (values: {
    type: StartableAgentType;
    name: string;
    cwd: string;
    mode: AgentMode;
    prompt: string;
    args: string[];
  }) => void;
  onCancel: () => void;
  error?: string | null;
  isSubmitting?: boolean;
  width: number;
  height: number;
}

interface StartAgentValues {
  type: StartableAgentType;
  name: string;
  cwd: string;
  mode: AgentMode;
  prompt: string;
  args?: string;
}

const FOCUS_ORDER: Focus[] = ["type", "mode", "cwd", "name", "prompt", "args", "submit", "cancel"];

export function nextFocus(focus: Focus): Focus {
  return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) + 1) % FOCUS_ORDER.length];
}

export function previousFocus(focus: Focus): Focus {
  return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length];
}

export function isTextFieldFocus(focus: Focus): boolean {
  return focus === "cwd" || focus === "name" || focus === "prompt" || focus === "args";
}

type FieldNav = "next" | "previous" | null;

export function resolveFieldNav(
  focus: Focus,
  key: { down?: boolean; up?: boolean; tab?: boolean; shift?: boolean; input?: string },
): FieldNav {
  if (key.tab && key.shift) return "previous";
  if (key.tab || key.down || (key.input === "j" && !isTextFieldFocus(focus))) return "next";
  if (key.up || (key.input === "k" && !isTextFieldFocus(focus))) return "previous";
  return null;
}

export function expandHomePath(input: string, home: string = os.homedir()): string {
  if (input === "~") return home;
  if (input.startsWith("~/")) return `${home}${input.slice(1)}`;
  return input;
}

export function nextRecentCwd(current: string, recents: readonly string[]): string | null {
  const list = recents.filter(Boolean);
  if (!list.length) return null;
  const index = list.indexOf(current);
  return list[(index + 1 + list.length) % list.length] ?? null;
}

export function splitArgString(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;
  let hasToken = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        args.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken) args.push(current);
  return args;
}

export function normalizeStartAgentValues(values: StartAgentValues): {
  type: StartableAgentType;
  name: string;
  cwd: string;
  mode: AgentMode;
  prompt: string;
  args: string[];
} {
  return {
    type: values.type,
    name: values.name.trim(),
    cwd: expandHomePath(values.cwd.trim()),
    mode: isModeAllowedForType(values.mode, values.type) ? values.mode : "interactive",
    prompt: values.prompt?.trim() ?? "",
    args: splitArgString(values.args ?? ""),
  };
}

export function getStartPaneHints(focus: Focus): string[] {
  switch (focus) {
    case "type":
      return ["↑/↓/j/k type", "tab next", "esc back"];
    case "mode":
      return ["←/→/h/l mode", "tab next", "esc back"];
    case "cwd":
    case "name":
      return ["tab next", "enter next", "esc back"];
    case "prompt":
    case "args":
      return ["tab next", "enter next", "esc back"];
    case "submit":
      return ["enter start", "tab next", "esc back"];
    case "cancel":
      return ["enter cancel", "tab next", "esc back"];
  }
}

export function getStartTypeAvailability(
  exists: (command: string) => boolean = commandExistsOnPath,
): Record<StartableAgentType, boolean> {
  const availability = {} as Record<StartableAgentType, boolean>;
  for (const type of STARTABLE_AGENT_TYPES) {
    availability[type] = exists(HARNESS_RUNTIME_PROFILES[type].command);
  }
  return availability;
}

const START_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

export interface StartAgentFieldErrors {
  name?: string;
  cwd?: string;
}

export function validateStartAgentValues(
  values: Pick<StartAgentValues, "name" | "cwd">,
  cwdExists: (dir: string) => boolean = (dir) => fs.existsSync(dir),
): StartAgentFieldErrors {
  const errors: StartAgentFieldErrors = {};
  if (!values.name) {
    errors.name = "Name is required.";
  } else if (!START_NAME_REGEX.test(values.name)) {
    errors.name = "Lowercase letters, digits and hyphens; start/end alphanumeric, 2-64 chars.";
  }
  if (!values.cwd) {
    errors.cwd = "Working directory is required.";
  } else if (!cwdExists(path.resolve(values.cwd))) {
    errors.cwd = `Directory "${values.cwd}" does not exist.`;
  }
  return errors;
}

export function hasStartAgentErrors(errors: StartAgentFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function trimStartAgentError(error: string, width: number, maxLines = 4): string {
  const max = Math.max(20, width - 6);
  const clip = (line: string) => (line.length > max ? `${line.slice(0, max - 1)}...` : line);
  const lines = error.split("\n").map((line) => line.trimEnd());
  const visible = lines.slice(-maxLines);
  return visible.map(clip).join("\n");
}

export const StartAgentPane: React.FC<StartAgentPaneProps> = ({
  initialType = "codex",
  initialName,
  initialCwd,
  recentCwds = [],
  onSubmit,
  onCancel,
  error = null,
  isSubmitting = false,
  width,
  height,
}) => {
  const [type, setType] = useState<StartableAgentType>(initialType);
  const [mode, setMode] = useState<AgentMode>("interactive");
  const [cwd, setCwd] = useState(initialCwd);
  const [name, setName] = useState(initialName);
  const [prompt, setPrompt] = useState("");
  const [args, setArgs] = useState("");
  const [focus, setFocus] = useState<Focus>("type");
  const typeAvailability = useMemo(() => getStartTypeAvailability(), []);
  const tmuxAvailable = useMemo(() => commandExistsOnPath("tmux"), []);
  const [fieldErrors, setFieldErrors] = useState<StartAgentFieldErrors>({});

  const submittedRef = useRef(false);
  useEffect(() => {
    if (!isSubmitting) submittedRef.current = false;
  }, [isSubmitting]);

  const changeType = (next: StartableAgentType): void => {
    setType(next);
    if (!isModeAllowedForType(mode, next)) setMode("interactive");
  };

  const submit = (): void => {
    // Both this useInput and TextInput's onSubmit fire on Enter; guard so the
    // form submits once per keypress.
    if (isSubmitting || submittedRef.current) return;
    const values = normalizeStartAgentValues({ type, name, cwd, mode, prompt, args });
    const errors = validateStartAgentValues(values);
    setFieldErrors(errors);
    if (hasStartAgentErrors(errors)) return;
    submittedRef.current = true;
    onSubmit(values);
  };

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!isSubmitting) {
      setElapsedSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [isSubmitting]);

  useInput((input, key) => {
    if (key.escape || input === "\u001b") {
      onCancel();
      return;
    }
    if (isSubmitting) return;

    if (input === "q" && !isTextFieldFocus(focus)) {
      onCancel();
      return;
    }

    if (focus === "type") {
      if (key.upArrow || input === "k" || key.leftArrow) {
        changeType(previousStartAgentType(type));
        return;
      }
      if (key.downArrow || input === "j" || key.rightArrow) {
        changeType(nextStartAgentType(type));
        return;
      }
      if (key.tab && key.shift) {
        setFocus(previousFocus(focus));
        return;
      }
      if (key.tab || key.return) {
        setFocus(nextFocus(focus));
        return;
      }
      return;
    }

    if (focus === "mode") {
      if (key.leftArrow || key.rightArrow || input === "h" || input === "l") {
        setMode(nextAgentMode(mode, type));
        return;
      }
    }

    if (focus === "cwd" && key.ctrl && input === "r") {
      const next = nextRecentCwd(cwd, recentCwds);
      if (next) setCwd(next);
      return;
    }

    const nav = resolveFieldNav(focus, {
      down: key.downArrow,
      up: key.upArrow,
      tab: key.tab,
      shift: key.shift,
      input,
    });
    if (nav === "next") {
      setFocus(nextFocus(focus));
      return;
    }
    if (nav === "previous") {
      setFocus(previousFocus(focus));
      return;
    }

    if (key.return) {
      if (focus === "submit") {
        submit();
      } else if (focus === "cancel") {
        onCancel();
      } else if (focus === "name") {
        submit();
      } else {
        setFocus(nextFocus(focus));
      }
    }
  });

  const typeRows = getStartTypeRows(type);

  const innerWidth = Math.max(24, width - 4);

  return (
    <Panel width={width} height={height} focused paddingX={1} flexDirection="column" flexShrink={0}>
      <Box>
        <SectionTitle>START AN AGENT</SectionTitle>
        {isSubmitting ? (
          <Text color={TUI_COLORS.accent}> starting... {elapsedSeconds}s (esc to cancel)</Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={focus === "type" ? TUI_COLORS.accent : undefined}>Type:</Text>
        {typeRows.map((row) => (
          <Box key={row.type} width={innerWidth}>
            <Text color={row.marker.trim() ? TUI_COLORS.accent : undefined}>{row.marker}</Text>
            <Text
              color={row.marker.trim() ? TUI_COLORS.accent : undefined}
              bold={row.marker.trim().length > 0}
              dimColor={!typeAvailability[row.type] || (focus !== "type" && row.type !== type)}
            >
              {`${agentTypeLabel(row.type)}${typeAvailability[row.type] ? "" : " (missing)"}`}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} width={innerWidth}>
        <Text color={focus === "mode" ? TUI_COLORS.accent : undefined}>Mode: </Text>
        {(["interactive", "durable"] as const).map((candidate) => {
          const allowed = isModeAllowedForType(candidate, type);
          return (
            <Text
              key={candidate}
              color={candidate === mode ? TUI_COLORS.accent : undefined}
              inverse={focus === "mode" && candidate === mode}
              dimColor={!allowed}
            >
              {` ${candidate}${allowed ? "" : " (n/a)"} `}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1} width={innerWidth} flexDirection="column">
        <Box>
          <Text color={focus === "cwd" ? TUI_COLORS.accent : undefined}>Cwd: </Text>
          {focus === "cwd" ? (
            <TextInput
              value={cwd}
              onChange={(value) => {
                setCwd(value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.cwd;
                  return next;
                });
              }}
              onSubmit={() => setFocus("name")}
            />
          ) : (
            <Text>{cwd}</Text>
          )}
        </Box>
        {fieldErrors.cwd ? <Text color={TUI_COLORS.danger}>{fieldErrors.cwd}</Text> : null}
      </Box>

      <Box marginTop={1} width={innerWidth} flexDirection="column">
        <Box>
          <Text color={focus === "name" ? TUI_COLORS.accent : undefined}>Name: </Text>
          {focus === "name" ? (
            <TextInput
              value={name}
              onChange={(value) => {
                setName(value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.name;
                  return next;
                });
              }}
              onSubmit={submit}
            />
          ) : (
            <Text>{name}</Text>
          )}
        </Box>
        {fieldErrors.name ? <Text color={TUI_COLORS.danger}>{fieldErrors.name}</Text> : null}
      </Box>

      {focus === "cwd" && recentCwds.length ? (
        <Box width={innerWidth}>
          <Text dimColor>{`recent: ${recentCwds.slice(0, 3).join(" · ")} (ctrl+r)`}</Text>
        </Box>
      ) : null}

      <Box marginTop={1} width={innerWidth}>
        <Text color={focus === "prompt" ? TUI_COLORS.accent : undefined}>Task: </Text>
        {focus === "prompt" ? (
          <TextInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={() => setFocus("args")}
            placeholder="optional first message"
          />
        ) : (
          <Text dimColor={!prompt}>{prompt || "(none)"}</Text>
        )}
      </Box>

      {!tmuxAvailable ? (
        <Box marginTop={1}>
          <Text color={TUI_COLORS.warning}>
            tmux is not installed — starting an agent will fail until it is.
          </Text>
        </Box>
      ) : null}

      {!typeAvailability[type] ? (
        <Box marginTop={1}>
          <Text color={TUI_COLORS.warning}>
            {`"${HARNESS_RUNTIME_PROFILES[type].command}" was not found on PATH.`}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1} width={innerWidth}>
        <Text color={focus === "args" ? TUI_COLORS.accent : undefined}>Args: </Text>
        {focus === "args" ? (
          <TextInput
            value={args}
            onChange={setArgs}
            onSubmit={() => setFocus("submit")}
            placeholder="optional extra CLI args"
          />
        ) : (
          <Text dimColor={!args}>{args || "(none)"}</Text>
        )}
      </Box>

      {error ? (
        <Box marginTop={1}>
          <Text color={TUI_COLORS.danger}>{trimStartAgentError(error, width)}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text
          inverse={focus === "submit"}
          color={focus === "submit" ? TUI_COLORS.accent : undefined}
        >
          {isSubmitting ? " Starting " : " Start "}
        </Text>
        <Text> </Text>
        <Text
          inverse={focus === "cancel"}
          color={focus === "cancel" ? TUI_COLORS.accent : undefined}
        >
          {" Cancel "}
        </Text>
        <Text> </Text>
        <KeyHints hints={getStartPaneHints(focus)} />
      </Box>
    </Panel>
  );
};
