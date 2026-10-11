import Link from "next/link";
import Image from "next/image";
import GitHubButton from "@/components/GitHubButton";
import CommandBar from "@/components/CommandBar";
import CommandShowcase from "@/components/CommandShowcase";
import HeroConsole from "@/components/remotion/HeroConsole";

const SETUP_COMMAND = "npx ai-devkit@latest setup";
const INIT_COMMAND = "npx ai-devkit@latest init";

const agents = [
  { name: "Claude Code", logo: "/logo/claude-code.png", href: "https://www.anthropic.com/claude-code" },
  { name: "Cursor", logo: "/logo/cursor.png", href: "https://cursor.com" },
  { name: "Codex", logo: "/logo/codex.png", href: "https://openai.com/codex" },
  { name: "Gemini CLI", logo: "/logo/gemini-cli.png", href: "https://geminicli.com" },
  { name: "opencode", logo: "/logo/opencode.svg", href: "https://opencode.ai" },
  { name: "Antigravity", logo: "/logo/antigravity.png", href: "https://antigravity.ai" },
  { name: "Junie", logo: "/logo/junie.png", href: "https://junie.jetbrains.com" },
  { name: "Cline", logo: "/logo/cline.png", href: "https://cline.bot" },
  { name: "Devin", logo: "/logo/devin.png", href: "https://devin.ai" },
  { name: "Grok CLI", logo: "/logo/grok-cli.svg", href: "https://x.ai/cli" },
  { name: "Muse Code", logo: "/logo/muse-code.svg", href: "https://dev.meta.ai/products/muse-code/" },
];

const beforeAfter = [
  ["A terminal tab per agent", "One console for every session"],
  ["Rules copied into each agent's config", "One config, kept in sync"],
  ["Logs pasted from chat to chat", "agent send, straight from stdin"],
  ["Decisions forgotten next session", "Memory any agent can search"],
  ["“Done” because the agent stopped", "Done when tests prove it"],
];

const setupSteps = [
  {
    scope: "Once per machine",
    command: SETUP_COMMAND,
    body: "Detects your installed agents, adds the workflow skills, and connects shared memory to every agent that supports MCP.",
  },
  {
    scope: "Once per project",
    command: INIT_COMMAND,
    body: "Writes .ai-devkit.json and each agent's project files. Review them, then commit.",
  },
];

const container = "mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10";
const h2 =
  "text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-on-surface text-balance sm:text-4xl";

export default function Home() {
  return (
    <div className="page-home bg-surface-container-lowest text-on-surface">
      <section aria-labelledby="hero-heading" className="pb-20 lg:pb-28">
        <div className={`${container} pt-14 sm:pt-16 lg:pt-20`}>
          <p className="rise font-mono text-sm text-signal">
            Open-source CLI for AI coding agents
          </p>
          <h1
            id="hero-heading"
            className="rise mt-4 max-w-4xl text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.03em] text-on-surface text-balance sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Your coding agents are a team. Run them like one.
          </h1>
          <p
            className="rise mt-6 max-w-[56ch] text-lg leading-8 text-on-surface-variant"
            style={{ animationDelay: "160ms" }}
          >
            One config, one console, and shared memory for Claude Code, Cursor,
            Codex, and every other agent you run.
          </p>
          <div
            className="rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ animationDelay: "240ms" }}
          >
            <CommandBar command={SETUP_COMMAND} />
            <GitHubButton />
          </div>
        </div>

        <div
          className={`rise ${container} mt-14 lg:mt-16`}
          style={{ animationDelay: "340ms" }}
        >
          <HeroConsole label="Terminal demo: npx ai-devkit@latest agent console opens the AI DevKit agent console with four coding agents. You ask Claude Code to fix accessibility issues and send the result to Codex. Claude uses the agent-management skill to run agent send, and Codex receives the message and starts reviewing." />
        </div>
      </section>

      <section
        aria-labelledby="agents-heading"
        className="border-y border-surface-container bg-surface py-12 lg:py-14"
      >
        <div className={`${container} grid gap-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-center lg:gap-12`}>
          <h2
            id="agents-heading"
            className="text-xl font-semibold leading-snug text-on-surface"
          >
            Works with the agents you already run
          </h2>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {agents.map((agent) => (
              <li key={agent.name}>
                <a
                  href={agent.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex min-h-11 items-center gap-3 rounded-md text-[0.9375rem] font-medium text-on-surface-variant no-underline transition-colors hover:text-on-surface"
                >
                  <Image
                    src={agent.logo}
                    alt=""
                    width={28}
                    height={28}
                    className="agent-logo h-7 w-7 object-contain"
                    loading="lazy"
                  />
                  {agent.name}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="why-heading" className="py-20 lg:py-28">
        <div className={`${container} grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16`}>
          <div>
            <h2 id="why-heading" className={h2}>
              More agents, more mess. Unless they share a layer.
            </h2>
            <p className="mt-5 max-w-[46ch] text-base leading-7 text-on-surface-variant">
              AI DevKit sits above the tools you already use. It doesn&rsquo;t
              replace any of them.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-surface-container-high bg-surface">
            <table className="w-full border-collapse text-left text-[0.9375rem] leading-6">
              <caption className="sr-only">
                How working with several agents changes with AI DevKit
              </caption>
              <thead>
                <tr className="border-b border-surface-container-high">
                  <th scope="col" className="w-1/2 px-5 py-4 font-mono text-xs font-medium text-on-surface-dim sm:px-6">
                    Without
                  </th>
                  <th scope="col" className="w-1/2 px-5 py-4 font-mono text-xs font-medium text-signal sm:px-6">
                    With AI DevKit
                  </th>
                </tr>
              </thead>
              <tbody>
                {beforeAfter.map(([before, after]) => (
                  <tr key={before}>
                    <td className="px-5 py-3.5 align-top text-on-surface-dim sm:px-6">
                      {before}
                    </td>
                    <td className="px-5 py-3.5 align-top font-medium text-on-surface sm:px-6">
                      {after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        id="features"
        aria-labelledby="features-heading"
        className="border-t border-surface-container py-20 lg:py-28"
      >
        <div className={container}>
          <h2 id="features-heading" className={`${h2} max-w-3xl`}>
            Four commands that make your agents work together.
          </h2>
          <div className="mt-12">
            <CommandShowcase />
          </div>
          <p className="mt-10 text-base leading-7 text-on-surface-variant">
            Every agent also learns the same workflows through skills.{" "}
            <Link
              href="/skills"
              className="font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
            >
              Browse the skills registry
            </Link>
          </p>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="start-heading"
        className="border-t border-surface-container bg-surface py-20 lg:py-28"
      >
        <div className={container}>
          <h2 id="start-heading" className={h2}>
            Set up in two commands.
          </h2>
          <p className="mt-4 text-base leading-7 text-on-surface-variant">
            Free and MIT licensed. Needs Node.js 20.20 or newer.
          </p>

          <ol className="mt-12 grid gap-10 md:grid-cols-2 md:gap-8">
            {setupSteps.map((step) => (
              <li key={step.scope} className="flex min-w-0 flex-col">
                <h3 className="text-lg font-semibold text-on-surface">
                  {step.scope}
                </h3>
                <p className="mt-2 max-w-[48ch] text-base leading-7 text-on-surface-variant">
                  {step.body}
                </p>
                <CommandBar command={step.command} className="mt-5 w-full sm:w-auto sm:self-start" />
              </li>
            ))}
          </ol>

          <div className="mt-14 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <GitHubButton />
            <Link
              href="/docs/1-getting-started"
              className="inline-flex min-h-11 items-center text-base font-medium text-on-surface underline decoration-outline underline-offset-4 transition-colors hover:decoration-on-surface"
            >
              Read the getting started guide
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
