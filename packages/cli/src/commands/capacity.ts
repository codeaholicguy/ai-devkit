import type { Command } from "commander";
import { getCodexCapacityReport, getZaiCapacityReport } from "@ai-devkit/agent-manager";
import { renderCapacityReport } from "./capacity/render.js";
import type { CapacityReport } from "@ai-devkit/agent-manager";

type CapacityOptions = { json?: boolean };
type SupportedCapacityProvider = "codex" | "zai";
type ReportReader = (provider: SupportedCapacityProvider) => Promise<CapacityReport>;

async function readCapacityReport(provider: SupportedCapacityProvider): Promise<CapacityReport> {
  return provider === "zai" ? getZaiCapacityReport() : getCodexCapacityReport();
}

function normalizeProvider(provider: string | undefined): SupportedCapacityProvider | null {
  const normalized = provider?.toLowerCase() ?? "codex";
  if (normalized === "z.ai") return "zai";
  return normalized === "codex" || normalized === "zai" ? normalized : null;
}

export async function capacityCommand(
  provider: string | undefined,
  options: CapacityOptions,
  readReport: ReportReader = readCapacityReport,
): Promise<void> {
  const normalized = normalizeProvider(provider);
  if (!normalized) {
    throw new Error(
      `Unknown capacity provider "${provider}". Supported providers: "codex", "zai".`,
    );
  }
  const report = await readReport(normalized);
  renderCapacityReport(report, options);
}

export function registerCapacityCommand(
  program: Command,
  readReport: ReportReader = readCapacityReport,
): void {
  program
    .command("capacity [provider]")
    .description("Report AI provider capacity")
    .option("-j, --json", "Output as JSON")
    .action((provider: string | undefined, options: CapacityOptions) =>
      capacityCommand(provider, options, readReport),
    );
}
