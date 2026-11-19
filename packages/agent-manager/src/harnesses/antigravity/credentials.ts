import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const EXPIRY_SAFETY_WINDOW_MS = 60_000;

type UnknownRecord = Record<string, unknown>;

export type AntigravityOAuthCredential = {
  accessToken: string;
  projectId: string | null;
};

export type AntigravityCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  readFile?: (target: string, encoding: BufferEncoding) => Promise<string>;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseExpiryMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const text = nonEmptyText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function isExpired(expiryValue: unknown, nowMs: number): boolean {
  const expiryMs = parseExpiryMs(expiryValue);
  if (expiryMs === null) return false;
  return expiryMs - nowMs <= EXPIRY_SAFETY_WINDOW_MS;
}

function parseCredentialPayload(raw: string, nowMs: number): AntigravityOAuthCredential | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const root = record(parsed);
  if (!root) return null;

  const nestedToken = record(root.token);
  const accessToken = nonEmptyText(
    nestedToken?.access_token ?? nestedToken?.accessToken ?? root.access_token ?? root.accessToken,
  );
  if (!accessToken) return null;

  const expiry =
    nestedToken?.expiry ??
    nestedToken?.expiry_date ??
    nestedToken?.expiryDate ??
    root.expiry ??
    root.expiry_date ??
    root.expiryDate;
  if (isExpired(expiry, nowMs)) return null;

  const projectId = nonEmptyText(root.project_id ?? root.projectID ?? root.projectId);
  return { accessToken, projectId };
}

async function readCredentialFile(
  filePath: string,
  nowMs: number,
  read: (target: string, encoding: BufferEncoding) => Promise<string>,
): Promise<AntigravityOAuthCredential | null> {
  try {
    const raw = await read(filePath, "utf8");
    return parseCredentialPayload(raw, nowMs);
  } catch {
    return null;
  }
}

export async function resolveAntigravityOAuthCredential(
  options: AntigravityCredentialOptions = {},
): Promise<AntigravityOAuthCredential | null> {
  const env = options.env ?? process.env;
  const nowMs = (options.now?.() ?? new Date()).getTime();

  const envAccessToken = nonEmptyText(env.ANTIGRAVITY_ACCESS_TOKEN);
  if (envAccessToken) {
    return {
      accessToken: envAccessToken,
      projectId: nonEmptyText(env.ANTIGRAVITY_PROJECT_ID),
    };
  }

  const envCredentialsJson = nonEmptyText(env.ANTIGRAVITY_OAUTH_CREDENTIALS_JSON);
  if (envCredentialsJson) {
    const fromJson = parseCredentialPayload(envCredentialsJson, nowMs);
    if (fromJson) return fromJson;
  }

  const home = nonEmptyText(env.HOME) ?? os.homedir();
  const read = options.readFile ?? readFile;
  const candidateFiles = [
    path.join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
    path.join(home, ".codexbar", "antigravity", "oauth_creds.json"),
  ];

  for (const filePath of candidateFiles) {
    const credential = await readCredentialFile(filePath, nowMs, read);
    if (credential) return credential;
  }

  return null;
}
