import { readFile } from "node:fs/promises";
import { join } from "node:path";

type UnknownRecord = Record<string, unknown>;

export type CodexCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  now?: () => Date;
};

export type CodexCredentials = {
  personalAccessToken: string | null;
  oauth: { access: string; accountId: string } | null;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function resolveCodexAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.CODEX_HOME || join(env.HOME || "", ".codex");
  return join(root, "auth.json");
}

function jwtExpiry(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return finiteNumber(record(JSON.parse(Buffer.from(part, "base64url").toString("utf8")))?.exp);
  } catch {
    return null;
  }
}

function staleOAuth(tokens: UnknownRecord, token: string, now: Date): boolean {
  const metadata = tokens.expires_at ?? tokens.expiresAt ?? tokens.expiry;
  let expiry: number | null = finiteNumber(metadata);
  if (typeof metadata === "string") {
    const parsed = Date.parse(metadata);
    expiry = Number.isNaN(parsed) ? null : parsed / 1000;
  }
  expiry ??= jwtExpiry(token);
  return expiry !== null && expiry <= now.getTime() / 1000;
}

export async function resolveCodexCredentials(
  options: CodexCredentialOptions = {},
): Promise<CodexCredentials | null> {
  let auth: UnknownRecord;
  try {
    const contents = await (options.readFile ?? readFile)(
      resolveCodexAuthPath(options.env),
      "utf8",
    );
    auth = record(JSON.parse(contents)) ?? {};
  } catch {
    return null;
  }

  const personalAccessToken = nonEmptyText(auth.personal_access_token);
  const tokens = record(auth.tokens);
  const access = nonEmptyText(tokens?.access_token);
  const accountId = nonEmptyText(tokens?.account_id);
  const now = options.now?.() ?? new Date();
  const oauth =
    tokens && access && accountId && !staleOAuth(tokens, access, now)
      ? { access, accountId }
      : null;
  return { personalAccessToken, oauth };
}
