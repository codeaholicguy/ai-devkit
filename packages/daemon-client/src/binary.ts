import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Locate the devkitd binary. Resolution order:
 *  1. DEVKITD_BIN env override (AI_DEVKITD_BIN accepted as a deprecated alias)
 *  2. Platform package `@ai-devkit/devkitd-<plat>-<arch>` (npm optional dep)
 *  3. ~/.ai-devkit/bin/devkitd (manual install)
 *  4. rust/target/{release,debug}/devkitd relative to the monorepo (dev)
 * Returns null when nothing is found — callers must degrade gracefully.
 */
export function resolveDaemonBinary(): string | null {
  const env = process.env.DEVKITD_BIN ?? process.env.AI_DEVKITD_BIN;
  if (env && fs.existsSync(env)) return env;

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
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* package not installed */
    }
  }

  const home = path.join(os.homedir(), ".ai-devkit", "bin", "devkitd");
  if (fs.existsSync(home)) return home;

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
    if (best) return best.file;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
