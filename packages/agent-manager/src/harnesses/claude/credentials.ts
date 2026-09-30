import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";

export type ClaudeCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  now?: () => Date;
  cwd?: string;
  platform?: NodeJS.Platform;
  keychainRead?: (service: string) => Promise<string | null>;
};

type Credential = { token: string | null; expired: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function credentialsPath(options: ClaudeCredentialOptions): string {
  const env = options.env ?? process.env;
  const configured = nonEmptyText(env.CLAUDE_CONFIG_DIR);
  if (configured) {
    const profileRoot = isAbsolute(configured)
      ? configured
      : resolve(options.cwd ?? process.cwd(), configured);
    return join(profileRoot, ".credentials.json");
  }
  return join(env.HOME || homedir(), ".claude", ".credentials.json");
}

function credentialFromRoot(root: Record<string, unknown> | null, now: Date): Credential {
  const oauth = record(root?.claudeAiOauth);
  const token = nonEmptyText(oauth?.accessToken);
  if (!token) return { token: null, expired: false };
  const expired =
    typeof oauth?.expiresAt === "number" &&
    Number.isFinite(oauth.expiresAt) &&
    oauth.expiresAt <= now.getTime();
  return { token: expired ? null : token, expired };
}

function credentialFromPayload(payload: string | null, now: Date): Credential {
  if (!payload) return { token: null, expired: false };
  try {
    return credentialFromRoot(record(JSON.parse(payload)), now);
  } catch {
    return { token: null, expired: false };
  }
}

async function readProfileCredential(
  options: ClaudeCredentialOptions,
  now: Date,
): Promise<Credential> {
  try {
    const payload = await (options.readFile ?? readFile)(credentialsPath(options), "utf8");
    return credentialFromPayload(payload, now);
  } catch {
    return { token: null, expired: false };
  }
}

async function readClaudeKeychain(service: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-w"],
      { encoding: "utf8", timeout: 1500, maxBuffer: 1024 * 1024 },
    );
    return nonEmptyText(stdout);
  } catch {
    return null;
  }
}

async function readKeychainCredential(
  options: ClaudeCredentialOptions,
  now: Date,
): Promise<Credential> {
  const env = options.env ?? process.env;
  const usesDefaultProfile = !nonEmptyText(env.CLAUDE_CONFIG_DIR);
  if (!usesDefaultProfile || (options.platform ?? process.platform) !== "darwin") {
    return { token: null, expired: false };
  }
  try {
    const payload = await (options.keychainRead ?? readClaudeKeychain)(CLAUDE_KEYCHAIN_SERVICE);
    return credentialFromPayload(payload, now);
  } catch {
    return { token: null, expired: false };
  }
}

export async function resolveClaudeAnthropicToken(
  options: ClaudeCredentialOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const environmentToken = nonEmptyText(env.CLAUDE_CODE_OAUTH_TOKEN);
  if (environmentToken) return environmentToken;

  const now = options.now?.() ?? new Date();
  const profileCredential = await readProfileCredential(options, now);
  if (profileCredential.token) return profileCredential.token;

  const keychainCredential = await readKeychainCredential(options, now);
  if (keychainCredential.token) return keychainCredential.token;
  if (profileCredential.expired || keychainCredential.expired) {
    throw new Error("Claude OAuth credentials expired");
  }
  throw new Error("Claude OAuth credentials not found or malformed");
}
