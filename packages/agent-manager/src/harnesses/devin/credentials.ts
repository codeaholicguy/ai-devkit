import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type UnknownRecord = Record<string, unknown>;

export type DevinCredential = {
  key: string;
  orgId: string;
};

export type DevinCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
};

const DEVIN_KEY_MISSING = "Devin API key not found; set DEVIN_API_KEY or log in with the Devin CLI";
const DEVIN_ORG_MISSING =
  "Devin organization id not found; set DEVIN_ORG_ID or log in with the Devin CLI";

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readText(path: string, options: DevinCredentialOptions): Promise<string | null> {
  try {
    return await (options.readFile ?? readFile)(path, "utf8");
  } catch (error) {
    if (record(error)?.code === "ENOENT") return null;
    throw error;
  }
}

function parseFlatToml(contents: string): UnknownRecord | null {
  const entries: UnknownRecord = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"(.*)"\s*$/.exec(trimmed);
    if (!match) return null;
    entries[match[1]] = match[2];
  }
  return entries;
}

async function resolveKey(home: string, options: DevinCredentialOptions): Promise<string> {
  const envKey = nonEmptyText(options.env?.DEVIN_API_KEY ?? process.env.DEVIN_API_KEY);
  if (envKey) return envKey;

  const contents = await readText(
    join(home, ".local", "share", "devin", "credentials.toml"),
    options,
  );
  if (contents === null) throw new Error(DEVIN_KEY_MISSING);
  const parsed = parseFlatToml(contents);
  if (parsed === null) throw new Error("Devin credentials file is malformed");
  const key = nonEmptyText(parsed.windsurf_api_key);
  if (!key) throw new Error(DEVIN_KEY_MISSING);
  return key;
}

async function resolveOrgId(home: string, options: DevinCredentialOptions): Promise<string> {
  const envOrg = nonEmptyText(options.env?.DEVIN_ORG_ID ?? process.env.DEVIN_ORG_ID);
  if (envOrg) return envOrg;

  const contents = await readText(join(home, ".config", "devin", "config.json"), options);
  if (contents === null) throw new Error(DEVIN_ORG_MISSING);
  const parsed = record(JSON.parse(contents));
  if (!parsed) throw new Error("Devin config file is malformed");
  const orgId = nonEmptyText(record(parsed.devin)?.org_id);
  if (!orgId) throw new Error(DEVIN_ORG_MISSING);
  return orgId;
}

export async function resolveDevinCredential(
  options: DevinCredentialOptions = {},
): Promise<DevinCredential> {
  const env = options.env ?? process.env;
  const home = env.HOME || homedir();
  const [key, orgId] = await Promise.all([resolveKey(home, options), resolveOrgId(home, options)]);
  return { key, orgId };
}
