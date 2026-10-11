import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CONSOLE_OPEN_AT, Caret, mono, palette, s } from "./theme";

// From a shell prompt the user opens the agent console and asks ui-claude to
// fix something and hand the result to api-codex. Claude sends it with the
// agent-management skill, the console follows the message, and Codex picks
// the review up. Times are relative to the console opening.
const T = {
  typeStart: s(1.8),
  typeEnd: s(3.8),
  send: s(4.2),
  claudeReply: s(5.4),
  skillCall: s(7),
  sentNote: s(8.4),
  handoff: s(9.4),
  codexReply: s(11),
};

const launchCommand = "npx ai-devkit@latest agent console";
const typedMessage = "fix the a11y issues, then send the result to api-codex";
const handoffMessage =
  "Review the checkout a11y fix on feat/checkout. Report blocking issues only.";

type Status = "run" | "wait" | "idle";

const statusStyle: Record<Status, { glyph: string; color: string }> = {
  run: { glyph: "●", color: palette.green },
  wait: { glyph: "○", color: palette.amber },
  idle: { glyph: "○", color: palette.dimmer },
};

interface Agent {
  name: string;
  type: string;
  activity: string;
  status: Status;
}

const busyAgents: Agent[] = [
  { name: "pi-planner", type: "pi", activity: "Planning migration", status: "run" },
  { name: "gemini-docs", type: "gemini", activity: "Updating API docs", status: "run" },
];

const agentsAt = (frame: number): Agent[] => [
  {
    name: "ui-claude",
    type: "claude",
    activity:
      frame < T.send ? "Waiting for input" : frame < T.sentNote ? "Fixing a11y" : "Sent to api-codex",
    status: frame < T.send ? "wait" : frame < T.sentNote ? "run" : "idle",
  },
  {
    name: "api-codex",
    type: "codex",
    activity: frame >= T.handoff ? "Reviewing the fix" : "Tests passed",
    status: frame >= T.handoff ? "run" : "idle",
  },
  ...busyAgents,
];

const typed = (frame: number, start: number, end: number, text: string) =>
  text.slice(
    0,
    Math.floor(
      interpolate(frame, [start, end], [0, text.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    ),
  );

const fadeUp = (frame: number, fps: number, duration = 0.4) => {
  const p = interpolate(frame, [0, Math.round(duration * fps)], [0, 1], {
    extrapolateRight: "clamp",
  });
  return { opacity: p, translate: `0 ${(1 - p) * 8}px` };
};

const FadeUp: React.FC<{ duration?: number; children: React.ReactNode }> = ({
  duration,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <div style={fadeUp(frame, fps, duration)}>{children}</div>;
};

const AgentRow: React.FC<Agent & { selected: boolean; divider: boolean; highlight: number }> = ({
  name,
  type,
  activity,
  status,
  selected,
  divider,
  highlight,
}) => {
  const st = statusStyle[status];
  return (
    <div
      style={{
        padding: "10px 8px",
        margin: "0 -8px",
        borderTop: divider ? `1px solid ${palette.border}` : undefined,
        borderRadius: 8,
        backgroundColor: `rgba(125, 207, 255, ${0.12 * highlight})`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 9,
          fontSize: 19,
          lineHeight: "27px",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 16, color: palette.cyan, flexShrink: 0 }}>{selected ? "▶" : ""}</span>
        <span style={{ color: st.color }}>{st.glyph}</span>
        <span style={{ width: 46, color: st.color }}>{status}</span>
        <span style={{ color: palette.cyan, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </span>
      </div>
      <div
        style={{
          paddingLeft: 25,
          fontSize: 16,
          lineHeight: "23px",
          color: palette.dimmer,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {type} · {activity}
      </div>
    </div>
  );
};

const AgentList: React.FC<{ agents: Agent[] }> = ({ agents }) => {
  const frame = useCurrentFrame();
  const handedOff = frame >= T.handoff;
  const highlight = interpolate(
    frame,
    [T.handoff - s(0.2), T.handoff, T.handoff + s(1.2)],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div style={{ border: `1px solid ${palette.border}`, borderRadius: 14, padding: "14px 18px" }}>
      <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.04em", color: palette.dim }}>
        AGENTS ({agents.length})
      </div>
      <div style={{ marginTop: 4 }}>
        {agents.map((agent, i) => (
          <Sequence key={agent.name} from={s(0.5) + i * s(0.25)} layout="none">
            <FadeUp duration={0.45}>
              <AgentRow
                {...agent}
                selected={agent.name === (handedOff ? "api-codex" : "ui-claude")}
                divider={i > 0}
                highlight={agent.name === "api-codex" ? highlight : 0}
              />
            </FadeUp>
          </Sequence>
        ))}
      </div>
    </div>
  );
};

const Message: React.FC<{ role: string; roleColor: string; text: string }> = ({
  role,
  roleColor,
  text,
}) => (
  <FadeUp>
    <div style={{ fontSize: 18, lineHeight: "25px", color: roleColor }}>{role}:</div>
    <div style={{ paddingLeft: 20, fontSize: 19, lineHeight: "27px", color: palette.text }}>
      {text}
    </div>
  </FadeUp>
);

const SkillCall: React.FC = () => (
  <FadeUp>
    <div
      style={{
        border: `1px solid ${palette.border}`,
        borderLeft: `3px solid ${palette.violet}`,
        borderRadius: 8,
        padding: "10px 14px",
        backgroundColor: palette.pane,
      }}
    >
      <div style={{ fontSize: 16, lineHeight: "23px", color: palette.violet }}>
        skill · agent-management
      </div>
      <div style={{ marginTop: 4, fontSize: 17, lineHeight: "25px", color: palette.text }}>
        <span style={{ color: palette.green }}>$ </span>
        ai-devkit agent send --id api-codex &quot;Review the checkout a11y fix on
        feat/checkout&hellip;&quot;
      </div>
    </div>
  </FadeUp>
);

const PreviewHeader: React.FC<{ name: string; tool: string }> = ({ name, tool }) => (
  <div style={{ fontSize: 18, lineHeight: "26px", whiteSpace: "nowrap" }}>
    <span style={{ fontWeight: 600, letterSpacing: "0.04em", color: palette.dim }}>PREVIEW</span>
    <span style={{ color: palette.dimmer }}> · </span>
    <span style={{ color: palette.cyan }}>{name}</span>
    <span style={{ color: palette.dimmer }}> · {tool} · ~/Code/web</span>
  </div>
);

const messages = { display: "flex", flexDirection: "column", gap: 14, marginTop: 14 } as const;

const Preview: React.FC = () => {
  const frame = useCurrentFrame();
  const swap = interpolate(frame, [T.handoff, T.handoff + s(0.35)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        padding: "14px 20px",
      }}
    >
      {frame < T.handoff ? (
        <>
          <PreviewHeader name="ui-claude" tool="Claude Code" />
          <div style={messages}>
            <Message
              role="assistant"
              roleColor={palette.cyan}
              text="Checkout form updated. Waiting for the next instruction."
            />
            <Sequence from={T.send} layout="none">
              <Message role="user" roleColor={palette.amber} text={typedMessage} />
            </Sequence>
            <Sequence from={T.claudeReply} layout="none">
              <Message
                role="assistant"
                roleColor={palette.cyan}
                text="Added focus rings and error copy. All 41 checks pass."
              />
            </Sequence>
            <Sequence from={T.skillCall} layout="none">
              <SkillCall />
            </Sequence>
            <Sequence from={T.sentNote} layout="none">
              <Message
                role="assistant"
                roleColor={palette.cyan}
                text="Sent the result to api-codex for review."
              />
            </Sequence>
          </div>
        </>
      ) : (
        <div style={{ opacity: swap, translate: `${(1 - swap) * 12}px 0` }}>
          <PreviewHeader name="api-codex" tool="Codex" />
          <div style={messages}>
            <Message
              role="assistant"
              roleColor={palette.cyan}
              text="Auth regression tests passed. Waiting for the next task."
            />
            <Message role="from ui-claude" roleColor={palette.violet} text={handoffMessage} />
            <Sequence from={T.codexReply} layout="none">
              <Message
                role="assistant"
                roleColor={palette.cyan}
                text="Reviewing the diff now. No blocking issues so far."
              />
            </Sequence>
          </div>
        </div>
      )}
    </div>
  );
};

const Console: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const agents = agentsAt(frame);
  const typing = frame >= T.typeStart && frame < T.send;
  const caretOn = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  const showHandoffNote = frame >= T.handoff && frame < T.handoff + s(3);
  const count = (status: Status) => agents.filter((a) => a.status === status).length;

  return (
    <AbsoluteFill style={{ fontFamily: mono, padding: "32px 40px 22px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          opacity: interpolate(frame, [0, s(0.4)], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ fontSize: 22, lineHeight: "30px" }}>
          <span style={{ color: palette.cyan, fontWeight: 600 }}>ai-devkit</span>
          <span style={{ color: palette.dim }}> · agent console  {agents.length} agents</span>
        </div>

        <div
          style={{
            marginTop: 16,
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 3fr) minmax(0, 7fr)",
            gap: 18,
          }}
        >
          <AgentList agents={agents} />

          <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
            <Preview />
            <div
              style={{
                border: `1px solid ${typing ? palette.cyan : palette.border}`,
                borderRadius: 14,
                padding: "13px 20px",
                fontSize: 19,
                lineHeight: "27px",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              <span style={{ color: palette.dimmer }}>{"> "}</span>
              {frame < T.typeStart ? (
                <span style={{ color: palette.dimmer }}>press i to message ui-claude</span>
              ) : (
                <span style={{ color: palette.text }}>
                  {typing && typed(frame, T.typeStart, T.typeEnd, typedMessage)}
                </span>
              )}
              {typing && <Caret visible={caretOn} size={21} />}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 17,
            lineHeight: "26px",
            color: palette.dimmer,
            whiteSpace: "nowrap",
          }}
        >
          {showHandoffNote ? (
            <span style={{ color: palette.violet }}>ui-claude → api-codex · message delivered</span>
          ) : (
            <span>
              {count("run")} run · {count("wait")} wait · {count("idle")} idle · updated now
            </span>
          )}
          {" · j/k nav · s start · i message · c channel"}
          <br />C stop · o open · r rename · K kill · h help · q quit
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ShellIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typeEnd = s(1.6);
  const caretOn = frame < typeEnd || Math.floor(frame / (fps * 0.5)) % 2 === 0;

  return (
    <AbsoluteFill style={{ fontFamily: mono, padding: "32px 40px", fontSize: 22, lineHeight: "32px" }}>
      <div>
        <span style={{ color: palette.green }}>$ </span>
        <span style={{ color: palette.text }}>{typed(frame, s(0.4), typeEnd, launchCommand)}</span>
        {frame < s(2) && <Caret visible={caretOn} size={24} />}
      </div>
    </AbsoluteFill>
  );
};

export default function AgentConsoleComposition() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      {frame < CONSOLE_OPEN_AT && <ShellIntro />}
      <Sequence from={CONSOLE_OPEN_AT}>
        <Console />
      </Sequence>
    </AbsoluteFill>
  );
}
