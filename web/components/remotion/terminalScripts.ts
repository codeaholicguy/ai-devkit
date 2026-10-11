import { blank, ln, seg, table, type TerminalScript } from "./terminal";

// Output mirrors real ai-devkit 0.70 runs; names and paths are examples.

const config: TerminalScript = {
  duration: 11,
  label:
    "Terminal demo: .ai-devkit.json lists claude, codex and cursor. A git diff adds gemini to the environments, then ai-devkit install sets it up from that one file.",
  panes: [
    {
      steps: [
        { at: 0.5, cmd: "jq -c .environments .ai-devkit.json" },
        { at: 1.9, out: [ln('["claude","codex","cursor"]')] },
        { at: 2.7, cmd: "git diff .ai-devkit.json" },
        {
          at: 3.6,
          out: [
            ln(seg("diff --git a/.ai-devkit.json b/.ai-devkit.json", "head")),
            ln(seg("--- a/.ai-devkit.json", "head")),
            ln(seg("+++ b/.ai-devkit.json", "head")),
            ln(seg("@@ -4,7 +4,8 @@", "info")),
            ln('     "claude",'),
            ln('     "codex",'),
            ln(seg('-    "cursor"', "del")),
            ln(seg('+    "cursor",', "add")),
            ln(seg('+    "gemini"', "add")),
            ln("   ],"),
          ],
        },
        { at: 5.6, cmd: "ai-devkit install" },
        {
          at: 6.6,
          stagger: 0.12,
          out: [
            blank,
            ln(seg("Install Summary:", "head")),
            ln(seg("  ✓ 1 artifact(s) installed", "ok")),
            ln(seg("  ✓ 3 artifact(s) already matched", "ok")),
            ln(seg("  ⊘ 7 artifact(s) preserved", "warn")),
          ],
        },
      ],
    },
  ],
};

const send: TerminalScript = {
  duration: 14,
  label:
    "Terminal demo: ai-devkit agent list shows three running agents. Failing test output is piped to ui-claude with agent send --stdin, a --wait message gets Claude's reply, and a review request goes to the reviewers group.",
  panes: [
    {
      steps: [
        { at: 0.5, cmd: "ai-devkit agent list" },
        {
          at: 1.4,
          out: [
            blank,
            ln(seg("Interactive Agents:", "head")),
            blank,
            ...table(
              ["Agent", "Type", "Status", "Working On", "Active"],
              [
                ["ui-claude", "Claude Code", seg("Idle", "dim"), "Checkout form validation", "2m ago"],
                ["api-codex", "Codex", seg("Running", "ok"), "Auth regression tests", "just now"],
                ["pi-planner", "Pi", seg("Idle", "dim"), "Data migration plan", "1h ago"],
              ],
            ),
          ],
        },
        { at: 2.9, cmd: "npm test 2>&1 | ai-devkit agent send --id ui-claude --stdin", cps: 40 },
        { at: 4.8, out: [ln(seg("✔ Sent message to ui-claude.", "ok"))] },
        {
          at: 5.6,
          cmd: 'ai-devkit agent send --id ui-claude --wait "did the checkout tests pass?"',
          cps: 40,
        },
        {
          at: 8.4,
          out: [ln("Yes. All 41 checkout tests pass now; totals use integer cents.")],
        },
        {
          at: 9.2,
          cmd: 'ai-devkit agent send --group reviewers "review the checkout branch"',
          cps: 40,
        },
        { at: 11.2, out: [ln(seg('✔ Sent message to 2 agent(s) in group "reviewers".', "ok"))] },
      ],
    },
  ],
};

const memory: TerminalScript = {
  duration: 12.5,
  label:
    "Terminal demo in two panes: Claude Code stores a project decision with ai-devkit memory store. Three days later, in a new Codex session, ai-devkit memory search finds it.",
  panes: [
    {
      title: "ui-claude · Claude Code",
      weight: 10,
      steps: [
        {
          at: 0.5,
          cps: 48,
          cmd: [
            "ai-devkit memory store --scope project:shop \\",
            '  --title "Checkout API returns money as integer cents" \\',
            '  --content "Amounts are integer cents plus an ISO currency code. Never floats."',
          ].join("\n"),
        },
        {
          at: 4.6,
          out: [
            ln("{"),
            ln('  "success": ', seg("true", "ok"), ","),
            ln('  "id": ', seg('"a2073f27-35a7-4ed2-bdf0-a8bb5a19af07"', "ok"), ","),
            ln('  "message": ', seg('"Knowledge stored successfully"', "ok")),
            ln("}"),
          ],
        },
      ],
    },
    {
      title: "api-codex · Codex · new session, 3 days later",
      weight: 7,
      steps: [
        { at: 6.4, cmd: 'ai-devkit memory search --query "how do we format money?" --table', cps: 40 },
        {
          at: 8.6,
          out: table(
            ["ID", "Title", "Scope"],
            [["a2073f27", "Checkout API returns money as integer cents", "project:shop"]],
          ),
        },
      ],
    },
  ],
};

const status: TerminalScript = {
  duration: 14.5,
  label:
    "Terminal demo: ai-devkit status reports memory MCP not wired for Codex. ai-devkit setup --agent codex configures it, and status then shows memory MCP ready for every agent.",
  panes: [
    {
      steps: [
        { at: 0.5, cmd: "ai-devkit status" },
        {
          at: 1.3,
          out: [
            blank,
            ln(seg("AI DevKit Status:", "head")),
            blank,
            ...table(
              ["Scope", "Status", "Details"],
              [
                ["overall", seg("not ready", "warn"), "14 ready · 1 not ready · 0 fail · 3 info"],
                ["ai-devkit", seg("ready", "ok"), "0.70.0 (latest 0.70.0)"],
                ["project", seg("ready", "ok"), "~/shop/.ai-devkit.json"],
                ["tmux", seg("ready", "ok"), "tmux · 3.4"],
                [
                  "memory mcp",
                  seg("not ready", "warn"),
                  seg("codex: not wired · claude: wired · gemini: wired", "warn"),
                ],
              ],
            ),
          ],
        },
        { at: 3.4, cmd: "ai-devkit setup --agent codex" },
        {
          at: 4.6,
          stagger: 0.06,
          out: [
            blank,
            ln(seg("Setup Summary:", "head")),
            ln(seg("  ✓ 1 step installed", "ok")),
            ...table(
              ["agent", "step", "status", "message"],
              [["codex", "memory-mcp", seg("installed", "ok"), "Configured in ~/.codex/config.toml."]],
            ),
            ln(seg("Host Prerequisites:", "head")),
            ln(seg("✔ tmux 3.4 available", "ok")),
            ln(seg("✔ Setup completed successfully.", "ok")),
          ],
        },
        { at: 7.4, cmd: 'ai-devkit status | grep "memory mcp"' },
        {
          at: 8.8,
          out: [
            ln(
              "  memory mcp  ",
              seg("ready    ", "ok"),
              "  ",
              seg("codex: wired · claude: wired · gemini: wired", "ok"),
            ),
          ],
        },
      ],
    },
  ],
};

export const terminalScripts = { config, send, memory, status };
export type TerminalScriptId = keyof typeof terminalScripts;
