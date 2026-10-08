import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  DaemonClient,
  daemonSocketPath,
  ensureDaemon,
  resolveDaemonBinary,
} from "@ai-devkit/daemon-client";
import { withErrorHandler } from "../util/errors.js";

/**
 * `ai-devkit daemon` — manage the devkitd coordination daemon.
 * Normal operation needs no daemon command at all: any client auto-spawns it.
 * This command exists for status, logs, restart, and systemd persistence.
 */
export function registerDaemonCommand(program: Command): void {
  const cmd = program.command("daemon").description("Manage the devkitd coordination daemon");

  cmd
    .command("status")
    .option("-j, --json", "Output as JSON")
    .action(
      withErrorHandler("get daemon status", async (options: { json?: boolean }) => {
        const client = await DaemonClient.tryConnect();
        if (!client) {
          const bin = resolveDaemonBinary();
          const report = {
            running: false,
            socket: daemonSocketPath(),
            binary: bin,
          };
          if (options.json) console.log(JSON.stringify(report, null, 2));
          else {
            console.log("daemon: not running");
            console.log(`socket: ${report.socket}`);
            console.log(`binary: ${bin ?? "not found"}`);
          }
          return;
        }
        const status = await client.request("daemon.status");
        client.close();
        if (options.json) console.log(JSON.stringify(status, null, 2));
        else {
          const s = status as Record<string, unknown>;
          console.log(`daemon: running (v${s.version}, pid-owned socket)`);
          console.log(`started: ${new Date(s.startedAt as number).toISOString()}`);
          console.log(`socket: ${s.socket}`);
        }
      }),
    );

  cmd
    .command("start")
    .description("Ensure the daemon is running (auto-spawned anyway on use)")
    .action(
      withErrorHandler("start daemon", async () => {
        const client = await ensureDaemon();
        if (!client) {
          throw new Error(
            "could not start daemon — binary not found (DEVKITD_BIN, platform package, or cargo build)",
          );
        }
        console.log("daemon running");
        client.close();
      }),
    );

  cmd
    .command("stop")
    .description("Stop the daemon")
    .action(
      withErrorHandler("stop daemon", async () => {
        const client = await DaemonClient.tryConnect();
        if (!client) {
          console.log("daemon not running");
          return;
        }
        await client.request("shutdown");
        client.close();
        console.log("daemon stopped");
      }),
    );

  cmd
    .command("logs")
    .description("Tail the daemon log")
    .option("-n, --lines <n>", "Lines to show", "50")
    .action(
      withErrorHandler("show daemon logs", async (options: { lines: string }) => {
        const logPath = path.join(os.homedir(), ".ai-devkit", "daemon.log");
        if (!fs.existsSync(logPath)) {
          console.log("no daemon log yet");
          return;
        }
        const lines = fs.readFileSync(logPath, "utf8").trimEnd().split("\n");
        const tail = lines.slice(-parseInt(options.lines, 10));
        console.log(tail.join("\n"));
      }),
    );

  cmd
    .command("install")
    .description("Install a systemd --user unit for boot persistence")
    .action(
      withErrorHandler("install daemon", async () => {
        const bin = resolveDaemonBinary();
        if (!bin) throw new Error("daemon binary not found");
        const { spawnSync } = await import("node:child_process");
        const res = spawnSync(bin, ["install"], { stdio: "inherit" });
        if (res.status !== 0) throw new Error("daemon install failed");
      }),
    );
}
