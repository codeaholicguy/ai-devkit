import Link from "next/link";
import { builtInSkills } from "@/lib/skills/built-in";
import { groupSkills } from "@/lib/skills/groups";
import { getRegistrySkillCount } from "@/lib/skills/registry";
import CodeBlock from "@/components/docs/CodeBlock";
import RegistryBrowser from "@/components/skills/RegistryBrowser";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

export default function SkillsPage() {
  const registryCount = getRegistrySkillCount();
  const groups = groupSkills(builtInSkills);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "AI Coding Agent Skills",
    description:
      "Browse reusable AI coding agent skills for Claude Code, Codex, Cursor, opencode, Gemini CLI, and other supported coding agents.",
    url: `${siteUrl}/skills/`,
    isPartOf: {
      "@type": "WebSite",
      name: "AI DevKit",
      url: siteUrl,
    },
    about: [
      "AI coding agent skills",
      "Claude Code skills",
      "Codex skills",
      "Cursor skills",
      "opencode skills",
      "Gemini CLI skills",
    ],
    hasPart: builtInSkills.map((skill) => ({
      "@type": "TechArticle",
      name: `${skill.title} Skill`,
      description: skill.summary,
      url: `${siteUrl}/skills/${skill.name}/`,
    })),
  };

  return (
    <div className="docs-home skills-home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <header className="docs-home-hero">
        <p className="docs-home-eyebrow">Skills</p>
        <h1>Browse AI Coding Agent Skills</h1>
        <p className="docs-home-lede">
          Find reusable skills for Claude Code, Codex, Cursor, opencode, Gemini CLI, and other
          coding agents. Start with the {builtInSkills.length} built-in AI DevKit skills, or search{" "}
          {registryCount ? registryCount.toLocaleString("en-US") : "thousands of"} skills from public
          registries and copy the install command.
        </p>
      </header>

      <section id="built-in" className="faq-home-group skills-builtin" aria-labelledby="built-in-title">
        <div className="skills-builtin-head">
          <div>
            <h2 id="built-in-title">Built-in AI DevKit skills</h2>
            <p className="faq-home-group-desc">
              Start with workflow, debugging, testing, review, memory, documentation, and
              multi-agent skills that ship with AI DevKit.{" "}
              <Link href="/docs/7-skills">Learn how skills work</Link>
            </p>
          </div>
          <CodeBlock language="bash">
            <pre>
              <code>npx ai-devkit@latest skill add --built-in</code>
            </pre>
          </CodeBlock>
        </div>

        {groups.map(({ group, skills }) => (
          <div key={group.id} id={group.id} className="skills-group">
            <p className="docs-sidebar-label skills-group-label">{group.title}</p>
            <ul className="faq-home-cards">
              {skills.map((skill) => {
                const recommended = skill.name === "dev-lifecycle";
                return (
                  <li key={skill.name}>
                    <Link
                      href={`/skills/${skill.name}`}
                      className={recommended ? "faq-home-card skill-card-recommended" : "faq-home-card"}
                    >
                      <span className="skill-card-category">
                        {recommended ? "Recommended" : skill.category}
                      </span>
                      <h3 className="faq-home-card-title">{skill.title}</h3>
                      <span className="faq-home-card-desc">{skill.summary}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section id="registry" className="faq-home-group" aria-labelledby="registry-title">
        <h2 id="registry-title">Search the Registry</h2>
        <p className="faq-home-group-desc">
          Find skills by name, workflow, registry, or capability. Works with Claude Code, Codex,
          Cursor, opencode, Gemini CLI, GitHub Copilot, Cline, Devin, Kilo Code, and Roo Code.
        </p>
        <RegistryBrowser />
      </section>
    </div>
  );
}
