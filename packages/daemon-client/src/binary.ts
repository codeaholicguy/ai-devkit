import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface DaemonBinary {
  path: string;
  source: "env" | "package" | "home" | "dev";
  /**
   * Platform package version — the release this CLI expects to be serving
   * the socket. Only known for `package`; other sources skip the
   * stale-daemon check.
   */
  version?: string;
}

/** Path-only view of resolveDaemonBinaryInfo. */
export function resolveDaemonBinary(onDebug?: (msg: string) => void): string | null {
  return resolveDaemonBinaryInfo(onDebug)?.path ?? null;
}

/**
 * Ask the binary which release it is (`devkitd version`). Null when the
 * build is unstamped or the binary predates the command. Spawns a process —
 * only called on the rare version-mismatch path.
 */
export function readBinaryBuildVersion(bin: string): string | null {
  try {
    const res = spawnSync(bin, ["version"], { encoding: "utf8", timeout: 2000 });
    if (res.status !== 0) return null;
    const v = JSON.parse(res.stdout.trim()).buildVersion;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Locate the devkitd binary. Resolution order:
 *  1. DEVKITD_BIN env override (AI_DEVKITD_BIN accepted as a deprecated alias)
 *  2. Platform package `@ai-devkit/devkitd-<plat>-<arch>` (npm optional dep)
 *  3. ~/.ai-devkit/bin/devkitd (manual install)
 *  4. rust/target/{release,debug}/devkitd relative to the monorepo (dev)
 * Returns null when nothing is found — callers
 * must degrade gracefully.
 */
export function resolveDaemonBinaryInfo(onDebug?: (msg: string) => void): DaemonBinary | null {
  const env = process.env.DEVKITD_BIN ?? process.env.AI_DEVKITD_BIN;
  if (env && fs.existsSync(env)) {
    onDebug?.(`devkitd binary from env override: ${env}`);
    return { path: env, source: "env" };
  }

  const plats: Record<string, string> = {
    linux: "linux",
    darwin: "darwin",
    win32: "windows",
  };
  const archs: Record<string, string> = { x64: "x64", arm64: "arm64" };
  const plat = plats[process.platform];
  const arch = archs[process.arch];
  if (plat && arch) {
    try {
      const req = createRequire(import.meta.url);
      const pkgJson = req.resolve(`@ai-devkit/devkitd-${plat}-${arch}/package.json`);
      const candidate = path.join(
        path.dirname(pkgJson),
        process.platform === "win32" ? "devkitd.exe" : "devkitd",
      );
      if (fs.existsSync(candidate)) {
        const version = JSON.parse(fs.readFileSync(pkgJson, "utf8")).version;
        onDebug?.(`devkitd binary from platform package ${version}: ${candidate}`);
        // 0.0.0 is the unstamped in-repo manifest, not a release.
        return {
          path: candidate,
          source: "package",
          version: typeof version === "string" && version !== "0.0.0" ? version : undefined,
        };
      }
    } catch {
      /* package not installed */
    }
  }

  const home = path.join(os.homedir(), ".ai-devkit", "bin", "devkitd");
  if (fs.existsSync(home)) {
    onDebug?.(`devkitd binary from ~/.ai-devkit/bin: ${home}`);
    return { path: home, source: "home" };
  }

  // Dev checkout: walk up to the nearest rust/target/<profile>/devkitd and
  // pick the freshest profile — a stale release build otherwise shadows a
  // freshly-built debug binary forever. fileURLToPath so paths containing
  // spaces or other escaped chars resolve correctly.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    let best: { file: string; mtime: number } | null = null;
    for (const profile of ["release", "debug"]) {
      const candidate = path.join(dir, "rust", "target", profile, "devkitd");
      try {
        const mtime = fs.statSync(candidate).mtimeMs;
        if (!best || mtime > best.mtime) best = { file: candidate, mtime };
      } catch {
        /* absent */
      }
    }
    if (best) {
      onDebug?.(`devkitd binary from dev checkout: ${best.file}`);
      return { path: best.file, source: "dev" };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  onDebug?.("no devkitd binary found in any location");
  return null;
}
