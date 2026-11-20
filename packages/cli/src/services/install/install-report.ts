import { ui } from "../../util/terminal-ui.js";
import type { InstallReport } from "./install.service.js";

export function renderApplicationReport(report: InstallReport, title = "Install Summary"): void {
  const count = (status: string) => report.items.filter((item) => item.status === status).length;

  ui.summary({
    title,
    items: [
      { type: "success", count: count("installed"), label: "artifact(s) installed" },
      { type: "success", count: count("matched"), label: "artifact(s) already matched" },
      { type: "warning", count: count("skipped"), label: "artifact(s) preserved" },
      { type: "warning", count: count("conflict"), label: "artifact conflict(s) unresolved" },
      { type: "error", count: count("failed"), label: "artifact(s) failed" },
    ],
  });

  const details = report.items.filter(
    (item) =>
      ((item.status === "failed" || item.status === "conflict") && item.message) ||
      (item.status === "skipped" && item.section === "skill" && item.message),
  );
  for (const item of details) {
    if (item.status === "skipped" && item.section === "skill" && item.message) {
      ui.warning(item.message);
      continue;
    }
    ui.warning(`${item.section} ${item.name}: ${item.message}`);
  }

  for (const warning of report.warnings) {
    ui.warning(warning);
  }
}
