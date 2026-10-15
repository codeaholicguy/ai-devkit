import type { Metadata } from "next";
import { Suspense } from "react";
import RegistrySkillView, { RegistrySkillFallback } from "@/components/skills/RegistrySkillView";

// One page serves every third-party registry skill (?skill=owner/repo/name), filled
// in the browser. It stays out of search: the text is third-party and changes weekly.
export const metadata: Metadata = {
  title: "Registry skill",
  description: "Install command and SKILL.md for a skill from a public AI coding agent skill registry.",
  robots: { index: false, follow: true },
};

export default function RegistrySkillPage() {
  return (
    <Suspense fallback={<RegistrySkillFallback />}>
      <RegistrySkillView />
    </Suspense>
  );
}
