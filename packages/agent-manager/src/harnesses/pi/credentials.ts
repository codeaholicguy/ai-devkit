import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type UnknownRecord = Record<string, unknown>;

export type PiCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
};

export type PiAnthropicCredential = {
  kind: "oauth";
  access: string;
  expiresMs: number | null;
};

export type PiOpenAiCredential =
  | { kind: "platform"; key: string }
  | { kind: "oauth"; access: string; accountId: string; expiresMs: number | null };

const OPENAI_CREDENTIALS_MISSING =
  "OpenAI credentials not found; set OPENAI_API_KEY, configure the Pi openai provider, or log in to OpenAI via Pi";
const ZAI_CREDENTIAL_MISSING =
  "z.ai API key not found; set Z_AI_API_KEY or configure Pi provider zai";

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function epochMilliseconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value > 1e12 ? value : value * 1000;
}

async function readPiAuthRoot(options: PiCredentialOptions): Promise<UnknownRecord> {
  const env = options.env ?? process.env;
  const authPath = join(env.HOME || homedir(), ".pi", "agent", "auth.json");
  const contents = await (options.readFile ?? readFile)(authPath, "utf8");
  const parsed = record(JSON.parse(contents));
  if (!parsed) throw new Error("Pi auth file is malformed");
  return parsed;
}

export async function resolvePiAnthropicCredential(
  options: PiCredentialOptions = {},
): Promise<PiAnthropicCredential> {
  let root: UnknownRecord;
  try {
    root = await readPiAuthRoot(options);
  } catch (error) {
    if (record(error)?.code === "ENOENT") {
      throw new Error("Pi Anthropic OAuth credentials not found");
    }
    throw new Error("Pi Anthropic auth file is malformed");
  }

  const credential = record(root.anthropic);
  if (!credential) throw new Error("Pi Anthropic OAuth credentials not found");
  const access = credential.type === "oauth" ? nonEmptyText(credential.access) : null;
  if (!access) throw new Error("Pi Anthropic OAuth credential is malformed");
  return {
    kind: "oauth",
    access,
    expiresMs: epochMilliseconds(credential.expires),
  };
}

export async function resolvePiOpenAiCredential(
  options: PiCredentialOptions = {},
): Promise<PiOpenAiCredential> {
  const env = options.env ?? process.env;
  const environmentKey = nonEmptyText(env.OPENAI_API_KEY);
  if (environmentKey) return { kind: "platform", key: environmentKey };

  let root: UnknownRecord;
  try {
    root = await readPiAuthRoot(options);
  } catch (error) {
    if (record(error)?.code === "ENOENT") throw new Error(OPENAI_CREDENTIALS_MISSING);
    throw new Error("OpenAI Pi auth file is malformed");
  }

  const platform = record(root.openai);
  if (platform) {
    const key = platform.type === "api_key" ? nonEmptyText(platform.key) : null;
    if (!key) throw new Error("OpenAI Pi auth file has a malformed openai credential");
    return { kind: "platform", key };
  }

  const oauth = record(root["openai-codex"]);
  const access = oauth?.type === "oauth" ? nonEmptyText(oauth.access) : null;
  const accountId = nonEmptyText(oauth?.accountId);
  if (oauth && access && accountId) {
    return {
      kind: "oauth",
      access,
      accountId,
      expiresMs: epochMilliseconds(oauth.expires),
    };
  }
  throw new Error(OPENAI_CREDENTIALS_MISSING);
}

export async function resolvePiZaiApiKey(options: PiCredentialOptions = {}): Promise<string> {
  const env = options.env ?? process.env;
  const environmentKey = nonEmptyText(env.Z_AI_API_KEY);
  if (environmentKey) return environmentKey;

  let root: UnknownRecord;
  try {
    root = await readPiAuthRoot(options);
  } catch (error) {
    if (record(error)?.code === "ENOENT") throw new Error(ZAI_CREDENTIAL_MISSING);
    throw new Error("z.ai Pi auth file is malformed");
  }

  const credential = record(root.zai);
  if (!credential) throw new Error(ZAI_CREDENTIAL_MISSING);
  const key = credential.type === "api_key" ? nonEmptyText(credential.key) : null;
  if (!key) throw new Error("z.ai Pi auth file has a malformed zai credential");
  return key;
}
