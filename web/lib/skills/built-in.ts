export interface BuiltInSkill {
  name: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  useCases: string[];
  relatedAgents: string[];
}

export const builtInSkills: BuiltInSkill[] = [
  {
    name: "dev-lifecycle",
    title: "Dev Lifecycle",
    category: "Workflow",
    summary: "Orchestrate requirements, design, planning, implementation, testing, and review.",
    description:
      "Use dev-lifecycle when you want an AI coding agent to follow a structured software delivery process instead of improvising in chat. It routes work to focused phase skills and keeps higher-risk engineering work moving through explicit checkpoints.",
    useCases: [
      "Run a complete feature lifecycle with one repeatable workflow",
      "Choose the next delivery phase across requirements, design, planning, implementation, testing, and review",
      "Coordinate phase-specific AI DevKit skills without manually remembering every step",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode", "Gemini CLI"],
  },
  {
    name: "structured-debug",
    title: "Structured Debug",
    category: "Debugging",
    summary: "Guide debugging with expected behavior, reproduction, root cause analysis, and validation.",
    description:
      "Use structured-debug when diagnosing regressions, incidents, failing tests, or unclear production behavior. It pushes the agent to gather evidence, identify likely causes, and agree on a fix plan before changing code.",
    useCases: [
      "Investigate a failing behavior before jumping to a patch",
      "Create a clear root-cause hypothesis and validation plan",
      "Debug incidents, test failures, and regressions with less guesswork",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "tdd",
    title: "TDD",
    category: "Testing",
    summary: "Apply test-driven development by writing a failing test before production code.",
    description:
      "Use tdd when adding behavior or fixing bugs where a regression test should define success. It keeps the agent honest by establishing a failing test first, then implementing the smallest change that makes it pass.",
    useCases: [
      "Add behavior with a clear red-green-refactor loop",
      "Fix bugs with regression coverage",
      "Prevent agents from writing production code before the expected behavior is pinned down",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode", "Gemini CLI"],
  },
  {
    name: "verify",
    title: "Verify",
    category: "Verification",
    summary: "Require fresh terminal evidence before an agent claims work is complete.",
    description:
      "Use verify at the end of implementation, debugging, documentation, or release work. It makes completion claims evidence-based by requiring fresh command output such as tests, lint, build, or targeted checks.",
    useCases: [
      "Stop agents from saying work is done without proof",
      "Collect fresh lint, test, build, or smoke-check output",
      "Close a task with concrete verification evidence",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode", "Gemini CLI"],
  },
  {
    name: "memory",
    title: "Memory",
    category: "Memory",
    summary: "Use AI DevKit memory as a durable knowledge layer for reusable project context.",
    description:
      "Use memory when an agent should search, save, or update durable knowledge instead of relying on chat history. It is useful for recurring project facts, hard-won fixes, reusable workflows, and verified implementation notes.",
    useCases: [
      "Search reusable project context before non-trivial work",
      "Save verified knowledge that future agents should reuse",
      "Update stale memory entries when project behavior changes",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "agent-communication",
    title: "Agent Communication",
    category: "Multi-agent",
    summary: "Exchange information with active Codex, Claude Code, and other AI agents.",
    description:
      "Use agent-communication when you need one agent to find another active agent, read its recent context, or send it follow-up instructions. It supports multi-agent workflows where work is split across terminals or tools.",
    useCases: [
      "Find active coding agents and inspect their recent context",
      "Send instructions or handoff notes to another agent",
      "Coordinate parallel AI coding sessions without copying context by hand",
    ],
    relatedAgents: ["Claude Code", "Codex", "opencode"],
  },
  {
    name: "agent-orchestration",
    title: "Agent Orchestration",
    category: "Multi-agent",
    summary: "Scan running agents, assess progress, and coordinate multi-agent workflows.",
    description:
      "Use agent-orchestration when several AI agents are working at once and someone needs to act like the technical lead. It helps check progress, identify blocked work, and send next instructions until the workflow is complete.",
    useCases: [
      "Manage multiple active AI coding agents",
      "Check progress and unblock parallel work",
      "Coordinate multi-agent implementation, review, or research tasks",
    ],
    relatedAgents: ["Claude Code", "Codex", "opencode"],
  },
  {
    name: "document-code",
    title: "Document Code",
    category: "Documentation",
    summary: "Document code entry points with structured analysis and dependency mapping.",
    description:
      "Use document-code when you need an agent to understand and document a module, folder, function, or API. It emphasizes analysis before writing so generated docs are grounded in the actual code path.",
    useCases: [
      "Map a code entry point before changing it",
      "Create durable implementation notes for a module or API",
      "Explain dependencies and behavior for future maintainers",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "simplify-implementation",
    title: "Simplify Implementation",
    category: "Refactoring",
    summary: "Analyze and simplify complex code paths for maintainability.",
    description:
      "Use simplify-implementation when a solution is too complex, hard to read, or difficult to maintain. It favors a clear analysis and simplification plan before editing code.",
    useCases: [
      "Reduce unnecessary abstraction or complexity",
      "Improve readability in hard-to-maintain code",
      "Refactor implementation without changing behavior",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "security-review",
    title: "Security Review",
    category: "Review",
    summary: "Review code, skills, and prompts for vulnerabilities and insecure defaults.",
    description:
      "Use security-review when auditing implementation, AI skills, prompts, or release changes. It focuses on concrete vulnerabilities, prompt injection, business logic flaws, and insecure defaults.",
    useCases: [
      "Audit code before a release",
      "Review AI skills or prompts for injection risk",
      "Find security issues with evidence and severity",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "technical-writer",
    title: "Technical Writer",
    category: "Documentation",
    summary: "Review and improve documentation for clarity, structure, and novice comprehension.",
    description:
      "Use technical-writer when documentation needs to become clearer, more helpful, or easier for a new user to follow. It reviews docs as a reader and proposes concrete fixes before rewriting.",
    useCases: [
      "Improve README, docs, and guides",
      "Find unclear assumptions or missing setup steps",
      "Make technical writing easier for novice users",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "changelog",
    title: "Changelog",
    category: "Release",
    summary: "Update CHANGELOG.md from commits since the latest release.",
    description:
      "Use changelog when preparing release notes or keeping the Unreleased section current. It extracts concise changelog items from recent commits and links them back to source changes.",
    useCases: [
      "Prepare release notes from recent commits",
      "Update the Unreleased changelog section",
      "Summarize implementation history for maintainers",
    ],
    relatedAgents: ["Claude Code", "Codex"],
  },
  {
    name: "dev-commit",
    title: "Dev Commit",
    category: "Workflow",
    summary: "Create safe, verified commits from only the intended changes.",
    description:
      "Use dev-commit when work is ready to save as a git commit. It guides agents through status and diff inspection, validation, explicit staging, conventional commit messages, and final SHA/status reporting without including unrelated local changes.",
    useCases: [
      "Commit finished work without sweeping in unrelated files",
      "Stage only the intended paths after reviewing diffs",
      "Record validation evidence and a conventional commit message",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-worktree",
    title: "Dev Worktree",
    category: "Workflow",
    summary: "Set up or resume the right workspace before feature work.",
    description:
      "Use dev-worktree when starting, resuming, or switching feature work. It keeps workspace setup separate from implementation so agents begin from the correct branch, worktree, and repository context.",
    useCases: [
      "Start feature work in the right workspace",
      "Resume an existing lifecycle task",
      "Avoid mixing unrelated repository changes",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-requirements",
    title: "Dev Requirements",
    category: "Workflow",
    summary: "Capture and review requirements before design or implementation.",
    description:
      "Use dev-requirements when a feature needs clear scope, user value, constraints, and acceptance criteria before technical design or coding begins.",
    useCases: [
      "Clarify a new feature requirement",
      "Review scope and acceptance criteria",
      "Initialize requirement docs for lifecycle work",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-design",
    title: "Dev Design",
    category: "Workflow",
    summary: "Validate architecture and design trade-offs against requirements.",
    description:
      "Use dev-design when you need an agent to reason through architecture, risks, dependencies, and trade-offs before implementation starts.",
    useCases: [
      "Review a feature design against requirements",
      "Resolve technical trade-offs",
      "Document architecture decisions before coding",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-planning",
    title: "Dev Planning",
    category: "Workflow",
    summary: "Create and reconcile implementation plans from requirements and design.",
    description:
      "Use dev-planning when you need a concrete implementation plan, task breakdown, blocker capture, or progress reconciliation before code changes.",
    useCases: [
      "Turn a design into implementation tasks",
      "Mark progress and capture blockers",
      "Keep feature plans aligned with reality",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-implementation",
    title: "Dev Implementation",
    category: "Workflow",
    summary: "Execute planned implementation and check it against the approved design.",
    description:
      "Use dev-implementation when executing an approved plan. It keeps coding work tied to the design, phase docs, and verification expectations.",
    useCases: [
      "Implement planned feature tasks",
      "Check implementation against design",
      "Update phase docs during delivery",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-testing",
    title: "Dev Testing",
    category: "Workflow",
    summary: "Add and validate test coverage for feature work.",
    description:
      "Use dev-testing when implementation needs focused test coverage, coverage gap review, or validation before final review.",
    useCases: [
      "Add targeted tests for a feature",
      "Validate coverage gaps",
      "Run evidence-backed test checks",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-review",
    title: "Dev Review",
    category: "Workflow",
    summary: "Run a final pre-push review across design, implementation, tests, and risk.",
    description:
      "Use dev-review before pushing or merging work. It focuses on bugs, regressions, missing tests, and alignment with the approved design.",
    useCases: [
      "Review work before push",
      "Find integration risks and missing tests",
      "Check final design and implementation alignment",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
  {
    name: "dev-pr",
    title: "Dev PR",
    category: "Workflow",
    summary: "Publish a reviewed feature branch for code review.",
    description:
      "Use dev-pr after implementation, testing, and final review are complete. It syncs with the remote base branch, handles rebase conflicts carefully, reruns validation, pushes safely, and opens or updates the host review request.",
    useCases: [
      "Rebase a ready feature branch before review",
      "Push safely after validation",
      "Open or update a PR, merge request, or equivalent with clear status and risks",
    ],
    relatedAgents: ["Claude Code", "Codex", "Cursor", "opencode"],
  },
];

export function getBuiltInSkill(name: string): BuiltInSkill | undefined {
  return builtInSkills.find((skill) => skill.name === name);
}
