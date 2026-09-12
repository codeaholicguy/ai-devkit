#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_INDEX_FILES = new Set(["built-in.json", "builtin.json", "index.json", "registry.json"]);
const JUNK_FILES = new Set([".DS_Store"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SOURCE_ROOT = path.resolve(__dirname, "..");
const DEFAULT_DIST_DIR = path.join(DEFAULT_SOURCE_ROOT, "dist");
const DEFAULT_STAGE_ROOT = path.join(DEFAULT_DIST_DIR, "codex-plugin");

export async function stageCodexPlugin({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  stageRoot = DEFAULT_STAGE_ROOT,
} = {}) {
  const pluginManifestPath = path.join(sourceRoot, ".codex-plugin", "plugin.json");
  const pluginManifest = JSON.parse(await fs.readFile(pluginManifestPath, "utf8"));
  const version = readPluginVersion(pluginManifest);

  await fs.rm(stageRoot, { recursive: true, force: true });
  await fs.mkdir(stageRoot, { recursive: true });

  await copyDirectory(path.join(sourceRoot, ".codex-plugin"), path.join(stageRoot, ".codex-plugin"));
  await copyDirectory(path.join(sourceRoot, "skills"), path.join(stageRoot, "skills"), {
    filter: (sourcePath) => !SKILL_INDEX_FILES.has(path.basename(sourcePath)) && !isJunkFile(sourcePath),
  });
  await copyDirectory(path.join(sourceRoot, "hooks", "codex"), path.join(stageRoot, "hooks"));

  return { stageRoot, version };
}

export async function buildCodexPlugin({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  distDir = DEFAULT_DIST_DIR,
  stageRoot = DEFAULT_STAGE_ROOT,
} = {}) {
  await fs.mkdir(distDir, { recursive: true });

  const staged = await stageCodexPlugin({ sourceRoot, stageRoot });
  const outputPath = path.join(distDir, `plugin_${staged.version}.zip`);

  try {
    await fs.rm(outputPath, { force: true });
    await zipDirectory(staged.stageRoot, outputPath);
  } finally {
    await fs.rm(staged.stageRoot, { recursive: true, force: true });
  }

  return { ...staged, outputPath };
}

async function copyDirectory(sourceDir, targetDir, options = {}) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  await fs.mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (isJunkFile(sourcePath) || options.filter?.(sourcePath) === false) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, options);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

function isJunkFile(filePath) {
  return JUNK_FILES.has(path.basename(filePath));
}

function readPluginVersion(pluginManifest) {
  if (typeof pluginManifest.version !== "string" || pluginManifest.version.trim() === "") {
    throw new Error(".codex-plugin/plugin.json must define a non-empty version.");
  }

  return pluginManifest.version.trim();
}

async function zipDirectory(sourceDir, outputPath) {
  await new Promise((resolve, reject) => {
    const child = spawn("zip", ["-qry", outputPath, "."], {
      cwd: sourceDir,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`zip exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const result = await buildCodexPlugin();
  console.log(`Built ${path.relative(DEFAULT_SOURCE_ROOT, result.outputPath)}`);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
