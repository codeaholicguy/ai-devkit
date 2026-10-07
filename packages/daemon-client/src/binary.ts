import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";

/**
 * Locate the ai-devkitd binary. Resolution order:
 *  1. AI_DEVKITD_BIN env override
 *  2. Platform package `@ai-devkit/daemon-<plat>-<arch>` (npm optional dep)
 *  3. ~/.ai-devkit/bin/ai-devkitd (manual install)
 *  4. rust/target/{release,debug}/ai-devkitd relative to the monorepo (dev)
 * Returns null when nothing is found — callers must degrade gracefully.
 */
export function resolveDaemonBinary(): string | null {
  const env = process.env.AI_DEVKITD_BIN;
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
      const pkgJson = req.resolve(`@ai-devkit/daemon-${plat}-${arch}/package.json`);
      const candidate = path.join(
        path.dirname(pkgJson),
        process.platform === "win32" ? "ai-devkitd.exe" : "ai-devkitd",
      );
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* package not installed */
    }
  }

  const home = path.join(os.homedir(), ".ai-devkit", "bin", "ai-devkitd");
  if (fs.existsSync(home)) return home;

  // Dev checkout: walk up looking for rust/target/<profile>/ai-devkitd.
  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 8; i++) {
    for (const profile of ["release", "debug"]) {
      const candidate = path.join(dir, "rust", "target", profile, "ai-devkitd");
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
