import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { HARNESS_RUNTIME_PROFILES, type StartableAgentType } from "@ai-devkit/agent-manager";
import { KeyHints, Panel, SectionTitle, TUI_COLORS } from "../design-system/index.js";

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

export function getStartTypeRows(selected: StartableAgentType): {
  marker: string;
  type: StartableAgentType;
}[] {
  return STARTABLE_AGENT_TYPES.map((type) => ({
    marker: type === selected ? "▶ " : "  ",
    type,
  }));
}

type Focus = "type" | "cwd" | "name" | "submit" | "cancel";

interface StartAgentPaneProps {
  initialType?: StartableAgentType;
  initialName: string;
  initialCwd: string;
  onSubmit: (values: { type: StartableAgentType; name: string; cwd: string }) => void;
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
}

const FOCUS_ORDER: Focus[] = ["type", "cwd", "name", "submit", "cancel"];

export function nextFocus(focus: Focus): Focus {
  return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) + 1) % FOCUS_ORDER.length];
}

export function previousFocus(focus: Focus): Focus {
  return FOCUS_ORDER[(FOCUS_ORDER.indexOf(focus) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length];
}

type FieldNav = "next" | "previous" | null;

export function resolveFieldNav(
  focus: Focus,
  key: { down?: boolean; up?: boolean; tab?: boolean; shift?: boolean; input?: string },
): FieldNav {
  const textFieldFocused = focus === "cwd" || focus === "name";
  if (key.tab && key.shift) return "previous";
  if (key.tab || key.down || (key.input === "j" && !textFieldFocused)) return "next";
  if (key.up || (key.input === "k" && !textFieldFocused)) return "previous";
  return null;
}

export function normalizeStartAgentValues(values: StartAgentValues): StartAgentValues {
  return {
    type: values.type,
    name: values.name.trim(),
    cwd: values.cwd.trim(),
  };
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
  onSubmit,
  onCancel,
  error = null,
  isSubmitting = false,
  width,
  height,
}) => {
  const [type, setType] = useState<StartableAgentType>(initialType);
  const [cwd, setCwd] = useState(initialCwd);
  const [name, setName] = useState(initialName);
  const [focus, setFocus] = useState<Focus>("type");

  const submittedRef = useRef(false);
  useEffect(() => {
    if (!isSubmitting) submittedRef.current = false;
  }, [isSubmitting]);

  const submit = (): void => {
    // Both this useInput and TextInput's onSubmit fire on Enter; guard so the
    // form submits once per keypress.
    if (isSubmitting || submittedRef.current) return;
    submittedRef.current = true;
    onSubmit(normalizeStartAgentValues({ type, name, cwd }));
  };

  useInput((input, key) => {
    if (isSubmitting) return;
    if (key.escape || input === "\u001b") {
      onCancel();
      return;
    }

    if (focus === "type") {
      if (key.upArrow || input === "k" || key.leftArrow) {
        setType(previousStartAgentType(type));
        return;
      }
      if (key.downArrow || input === "j" || key.rightArrow) {
        setType(nextStartAgentType(type));
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
        {isSubmitting ? <Text color={TUI_COLORS.accent}> starting...</Text> : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={focus === "type" ? TUI_COLORS.accent : undefined}>Type:</Text>
        {typeRows.map((row) => (
          <Box key={row.type} width={innerWidth}>
            <Text color={row.marker.trim() ? TUI_COLORS.accent : undefined}>{row.marker}</Text>
            <Text
              color={row.marker.trim() ? TUI_COLORS.accent : undefined}
              bold={row.marker.trim().length > 0}
              dimColor={focus !== "type" && row.type !== type}
            >
              {row.type}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} width={innerWidth}>
        <Text color={focus === "cwd" ? TUI_COLORS.accent : undefined}>Cwd: </Text>
        {focus === "cwd" ? (
          <TextInput value={cwd} onChange={setCwd} onSubmit={() => setFocus("name")} />
        ) : (
          <Text>{cwd}</Text>
        )}
      </Box>

      <Box marginTop={1} width={innerWidth}>
        <Text color={focus === "name" ? TUI_COLORS.accent : undefined}>Name: </Text>
        {focus === "name" ? (
          <TextInput value={name} onChange={setName} onSubmit={submit} />
        ) : (
          <Text>{name}</Text>
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
        <KeyHints hints={["tab move", "esc back"]} />
      </Box>
    </Panel>
  );
};
