import { CliError } from "../../../util/errors.js";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function parseLocalRegistryPath(value: string): string | null {
  if (!value.toLowerCase().startsWith("file:")) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "file:") {
      throw new Error("invalid protocol");
    }
    if (url.hostname && url.hostname !== "localhost") {
      throw new Error("file URL hosts are not supported");
    }
    const localPath = fileURLToPath(url);
    if (!path.isAbsolute(localPath)) {
      throw new Error("path must be absolute");
    }
    return localPath;
  } catch (error: unknown) {
    throw new CliError(
      `Invalid local registry source "${value}": ${error instanceof Error ? error.message : String(error)}`,
      "INVALID_LOCAL_REGISTRY",
      { value },
    );
  }
}

function isPathShorthand(value: string): boolean {
  return path.isAbsolute(value) || /^\.\.?[\\/]/.test(value);
}

export async function normalizeRegistrySourceInput(
  value: string,
  baseDir: string,
): Promise<string> {
  const localPath = parseLocalRegistryPath(value);
  if (localPath === null && !isPathShorthand(value)) {
    return value;
  }

  const requestedPath = localPath ?? path.resolve(baseDir, value);
  let canonicalPath: string;
  try {
    canonicalPath = await fs.realpath(requestedPath);
  } catch {
    throw new CliError(
      `Local registry source not found: ${requestedPath}`,
      "LOCAL_REGISTRY_NOT_FOUND",
      { path: requestedPath },
    );
  }
  const stat = await fs.stat(canonicalPath);
  if (!stat.isDirectory()) {
    throw new CliError(
      `Local registry source is not a directory: ${canonicalPath}`,
      "INVALID_LOCAL_REGISTRY",
      { path: canonicalPath },
    );
  }
  return pathToFileURL(canonicalPath).href;
}

export async function normalizeRegistrySources(
  registries: Record<string, string>,
  baseDir: string,
): Promise<Record<string, string>> {
  const normalized: Record<string, string> = {};
  const localOwners = new Map<string, string>();
  for (const [id, value] of Object.entries(registries)) {
    const nextValue = await normalizeRegistrySourceInput(value, baseDir);
    const localPath = parseLocalRegistryPath(nextValue);
    if (localPath !== null) {
      const existingId = localOwners.get(localPath);
      if (existingId && existingId !== id) {
        throw new CliError(
          `Local folder is already registered as "${existingId}": ${localPath}`,
          "REGISTRY_SOURCE_CONFLICT",
          { id, existingId, path: localPath },
        );
      }
      localOwners.set(localPath, id);
    }
    normalized[id] = nextValue;
  }
  return normalized;
}

export interface AddSkillRegistryOptions {
  force?: boolean;
}

export type SkillRegistryAddStatus = "added" | "already-registered" | "updated";

export interface SkillRegistryMutation {
  registries: Record<string, string>;
  status: SkillRegistryAddStatus;
}

export type SkillRegistryRemoveStatus = "removed" | "not-registered";

export interface SkillRegistryRemoveMutation {
  registries: Record<string, string>;
  status: SkillRegistryRemoveStatus;
}

export function planSkillRegistryAdd(
  registries: Record<string, string>,
  id: string,
  url: string,
  options: AddSkillRegistryOptions = {},
): SkillRegistryMutation {
  const existingUrl = registries[id];

  if (existingUrl === url) {
    return { registries, status: "already-registered" };
  }

  if (existingUrl !== undefined && !options.force) {
    throw new CliError(
      `Registry "${id}" is already registered with a different URL. Use --force to overwrite it.`,
      "REGISTRY_CONFLICT",
      { id, existingUrl, requestedUrl: url },
    );
  }

  return {
    registries: { ...registries, [id]: url },
    status: existingUrl === undefined ? "added" : "updated",
  };
}

export function planSkillRegistryRemove(
  registries: Record<string, string>,
  id: string,
): SkillRegistryRemoveMutation {
  const nextRegistries = { ...registries };
  if (!Object.prototype.hasOwnProperty.call(registries, id)) {
    return { registries: nextRegistries, status: "not-registered" };
  }

  delete nextRegistries[id];
  return { registries: nextRegistries, status: "removed" };
}
