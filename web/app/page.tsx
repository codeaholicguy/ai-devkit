import Link from "next/link";
import Image from "next/image";
import GitHubButton from "@/components/GitHubButton";
import CopyCommandButton from "@/components/CopyCommandButton";

const agents = [
  { name: "Cursor", logo: "/logo/cursor.png", href: "https://cursor.com" },
  { name: "Claude Code", logo: "/logo/claude-code.png", href: "https://www.anthropic.com/claude-code" },
  { name: "Codex", logo: "/logo/codex.png", href: "https://openai.com/codex" },
  { name: "Antigravity", logo: "/logo/antigravity.png", href: "https://antigravity.ai" },
  { name: "opencode", logo: "/logo/opencode.png", href: "https://opencode.ai" },
  { name: "Gemini CLI", logo: "/logo/gemini-cli.png", href: "https://geminicli.com" },
  { name: "Junie", logo: "/logo/junie.png", href: "https://junie.jetbrains.com" },
  { name: "Cline", logo: "/logo/cline.png", href: "https://cline.bot" },
  { name: "Devin", logo: "/logo/devin.png", href: "https://devin.ai" },
];

const operatingLayer = [
  {
    label: ".ai-devkit.json",
    title: "One setup for the whole agent team",
    body: "Reconcile supported coding agents from one project-local source of truth, then re-run setup as your stack changes.",
  },
  {
    label: "agent console",
    title: "See every running agent",
    body: "See what is running, inspect local sessions, and keep long-running agents out of scattered terminal tabs.",
  },
  {
    label: "agent send",
    title: "Send work instead of copy-pasting context",
    body: "Send prompts, logs, test output, and review tasks to the right running agent or saved agent group.",
  },
  {
    label: "local SQLite",
    title: "Give agents memory without bloating prompts",
    body: "Store conventions, decisions, and reusable fixes locally so agents search when context is actually needed.",
  },
  {
    label: "verify",
    title: "Make done require proof",
    body: "Use workflow skills and verification gates so completion claims need fresh build or test output.",
  },
];

const comparisonRows = [
  ["Scattered terminal tabs", "One local console"],
  ["Duplicated agent rules", "One reconciled config"],
  ["Copy-pasted logs", "agent send with stdin"],
  ["Forgotten project decisions", "Local memory retrieval"],
  ["Done because the agent stopped", "Done with verification evidence"],
];

export default function Home() {
  return (
    <div className="bg-white text-[#2e303a]">
      <section className="relative isolate overflow-hidden border-b border-[#dde3da] bg-white">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1440px] items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.74fr_1.26fr] lg:px-10 lg:py-12">
          <div className="max-w-3xl">
            <p className="mb-5 font-mono text-[11px] font-medium uppercase leading-4 text-[#14521a]">
              The future is many AI coding agents
            </p>
            <h1 className="mb-6 max-w-3xl text-[40px] font-semibold leading-[48px] text-[#11131c] sm:text-[48px] sm:leading-[56px]">
              Your AI coding agents are a team now. Give them a way to work together.
            </h1>
            <p className="mb-8 max-w-2xl text-base leading-6 text-[#515367] sm:text-[16px]">
              AI DevKit is the control plane for Claude Code, Codex,
              Cursor, Gemini CLI, opencode, Pi, and other coding agents: one
              shared config, one console, local-first memory, cross-agent
              communication, and proof before done.
            </p>
            <p className="mb-5 max-w-2xl text-sm font-medium leading-5 text-[#2e303a]">
              Built for developers already operating more than one coding agent.
            </p>
            <p className="mb-5 max-w-2xl text-sm leading-5 text-[#515367]">
              Open source on GitHub and available from npm as{" "}
              <span className="font-mono">ai-devkit</span>.
            </p>

            <div className="flex flex-col gap-3 sm:items-start">
              <CopyCommandButton command="npx ai-devkit@latest init" />
              <Link
                href="/docs"
                className="text-sm font-semibold text-[#2a3e9a] no-underline hover:text-[#0c2483] hover:opacity-100"
              >
                Explore the docs
              </Link>
            </div>
          </div>

          <div id="agent-console-demo" className="relative scroll-mt-20">
            <div className="overflow-hidden">
              <video
                aria-label="AI DevKit agent console showing multiple local coding agent sessions"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="aspect-video h-auto w-full"
              >
                <source src="/showcase.webm" type="video/webm" />
              </video>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#dde3da] bg-[#f8faf7] py-8">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <p className="mb-4 text-center font-mono text-[11px] font-medium uppercase leading-4 text-[#515367]">
            Works with the agents you already use
          </p>
          <div className="relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
              {agents.map((agent) => (
                <a
                  key={agent.name}
                  href={agent.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-shrink-0 items-center justify-center px-5 py-3 transition-transform"
                >
                  <Image
                    src={agent.logo}
                    alt={`${agent.name} logo`}
                    width={140}
                    height={40}
                    className="agent-logo h-9 w-auto max-w-[140px] object-contain"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
          <p className="mt-4 text-center text-sm leading-5 text-[#515367]">
            Configure supported agents clearly. Keep the operating model consistent as your stack changes.
          </p>
        </div>
      </section>

      <section className="border-y border-[#dde3da] bg-[#f3f5ff] py-20">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <div>
            <p className="mb-3 font-mono text-[11px] font-medium uppercase leading-4 text-[#2a3e9a]">
              Before and after
            </p>
            <h2 className="text-[32px] font-semibold leading-[40px] text-[#11131c] sm:text-[48px] sm:leading-[56px]">
              One assistant became many agents. Now they need a way to work together.
            </h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#d5d9e8] bg-white">
            {comparisonRows.map(([before, after]) => (
              <div
                key={before}
                className="grid gap-0 border-b border-[#d5d9e8] last:border-b-0 md:grid-cols-2"
              >
                <div className="border-b border-[#d5d9e8] px-5 py-4 text-sm leading-5 text-[#515367] md:border-b-0 md:border-r">
                  {before}
                </div>
                <div className="px-5 py-4 text-sm font-semibold leading-5 text-[#14521a]">
                  {after}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="mb-3 font-mono text-[11px] font-medium uppercase leading-4 text-[#2a3e9a]">
                The new problem is orchestration
              </p>
              <h2 className="text-[32px] font-semibold leading-[40px] text-[#11131c] sm:text-[48px] sm:leading-[56px]">
                AI DevKit makes them operate as one local system.
              </h2>
            </div>
            <p className="max-w-3xl text-base leading-6 text-[#515367]">
              Multi-agent coding is powerful, but without shared setup, memory,
              communication, and verification, it becomes operationally messy.
              AI DevKit sits above the tools instead of replacing them.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {operatingLayer.map((item) => (
              <article
                key={item.label}
                className="rounded-lg border border-[#dde3da] bg-[#fbfcfb] p-5"
              >
                <p className="mb-5 font-mono text-[11px] font-medium uppercase leading-4 text-[#14521a]">
                  {item.label}
                </p>
                <h3 className="mb-3 text-2xl font-semibold leading-8 text-[#11131c]">
                  {item.title}
                </h3>
                <p className="mb-0 text-sm leading-5 text-[#515367]">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-10">
          <div className="min-w-0">
            <p className="mb-3 font-mono text-[11px] font-medium uppercase leading-4 text-[#14521a]">
              Start in 30 seconds
            </p>
            <h2 className="text-[32px] font-semibold leading-[40px] text-[#11131c] sm:text-[48px] sm:leading-[56px]">
              Create your agent control plane.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-6 text-[#515367]">
              The init flow writes project-local files you can review and
              commit. Re-run it whenever your agent list, skills, or workflow
              changes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/docs/1-getting-started"
                className="inline-flex min-h-12 w-full items-center justify-center rounded bg-[#b3f6ab] px-6 py-3 text-sm font-semibold text-[#003909] no-underline hover:bg-[#96d68f] hover:opacity-100 sm:w-auto"
              >
                Start with one command
              </Link>
              <GitHubButton
                repo="codeaholicguy/ai-devkit"
                className="w-full justify-center border-[#d5d9e8] bg-white text-[#2e303a] hover:bg-[#f3f5ff] sm:w-auto"
              />
            </div>
          </div>

          <div className="ethereal-panel min-w-0 overflow-hidden rounded-lg border border-[#d5d9e8] bg-[#0c0e17] p-4 font-mono text-xs leading-5 text-[#e1e1ef] sm:p-5 sm:text-sm sm:leading-[22px]">
            <div className="mb-4 flex items-center gap-2 text-[#c1c9bb]">
              <span className="h-3 w-3 rounded-full bg-[#ffb4ab]" />
              <span className="h-3 w-3 rounded-full bg-[#bac3ff]" />
              <span className="h-3 w-3 rounded-full bg-[#b3f6ab]" />
            </div>
            <pre className="m-0 max-w-full overflow-x-auto p-0 leading-5 sm:leading-[22px]">
              <code className="block whitespace-pre-wrap break-words text-[#fff] sm:whitespace-pre">{`npx ai-devkit@latest init --built-in
ai-devkit agent console
ai-devkit agent list
ai-devkit agent send "review this branch for release risk" --group reviewers
npm test 2>&1 | ai-devkit agent send --id codex --stdin
ai-devkit memory search --query "testing convention"`}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
