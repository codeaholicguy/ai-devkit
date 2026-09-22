import type { Command } from "commander";
import {
  getCodexCapacityReport,
  getZaiCapacityReport,
} from "@ai-devkit/agent-manager";
import { renderCapacityReports } from "./capacity/render.js";
import { getErrorMessage } from "../util/text.js";
import { ui } from "../util/terminal-ui.js";
import type { CapacityReport } from "@ai-devkit/agent-manager";

type CapacityOptions = { json?: boolean };
type SupportedCapacityProvider = "codex" | "zai";
type ReportReader = (
  provider: SupportedCapacityProvider,
) => Promise<CapacityReport>;

const SUPPORTED_PROVIDERS: readonly SupportedCapacityProvider[] = [
  "codex",
  "zai",
];
const SUPPORTED_PROVIDER_LIST = SUPPORTED_PROVIDERS.map(
  (provider) => `"${provider}"`,
).join(", ");

function reportCapacityFailure(
  provider: string,
  error: unknown,
  options: { json?: boolean } = {},
): void {
  const message = `${provider} capacity unavailable: ${getErrorMessage(error)}`;
  if (options.json) console.error(message);
  else ui.warning(message);
}

async function readCapacityReport(
  provider: SupportedCapacityProvider,
): Promise<CapacityReport> {
  return provider === "zai" ? getZaiCapacityReport() : getCodexCapacityReport();
}

function normalizeProvider(provider: string): SupportedCapacityProvider | null {
  const normalized = provider.toLowerCase();
  if (normalized === "z.ai") return "zai";
  return normalized === "codex" || normalized === "zai" ? normalized : null;
}

export async function capacityCommand(
  providers: string[] | undefined,
  options: CapacityOptions,
  readReport: ReportReader = readCapacityReport,
): Promise<void> {
  const requested = providers?.length ? providers : SUPPORTED_PROVIDERS;
  const normalized: SupportedCapacityProvider[] = [];
  for (const provider of requested) {
    const value = normalizeProvider(provider);
    if (!value) {
      throw new Error(
        `Unknown capacity provider "${provider}". Supported providers: ${SUPPORTED_PROVIDER_LIST}.`,
      );
    }
    if (!normalized.includes(value)) normalized.push(value);
  }

  const reports: CapacityReport[] = [];
  for (const provider of normalized) {
    try {
      reports.push(await readReport(provider));
    } catch (error) {
      if (normalized.length === 1) throw error;
      reportCapacityFailure(provider, error, options);
    }
  }
  renderCapacityReports(reports, options);
}

export function registerCapacityCommand(
  program: Command,
  readReport: ReportReader = readCapacityReport,
): void {
  program
    .command("capacity [providers...]")
    .description("Report AI provider capacity")
    .option("-j, --json", "Output as JSON")
    .action((providers: string[] | undefined, options: CapacityOptions) =>
      capacityCommand(providers, options, readReport),
    );
}
