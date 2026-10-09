import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(pkgDir, "dist", "bundle");
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [join(pkgDir, "src", "cli.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  splitting: true,
  outdir,
  // Native / wasm modules that cannot be inlined, plus @ai-devkit/memory
  // which is only ever reached via lazy import() and ships wasm deps.
  // CJS deps (telegraf, fs-extra, ...) call bare require(); provide a real one.
  // esbuild emits this before each chunk's code but after the entry's shebang.
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  external: [
    "better-sqlite3",
    "yoga-layout",
    "@ai-devkit/memory",
    "react-devtools-core",
  ],
  logOverride: { "unsupported-dynamic-import": "silent" },
});

// agent-manager resolves SQL migrations as dirname(import.meta.url)/migrations;
// inside the bundle that directory is dist/bundle, so ship them alongside.
cpSync(
  join(pkgDir, "..", "agent-manager", "src", "database", "migrations"),
  join(outdir, "migrations"),
  { recursive: true },
);
