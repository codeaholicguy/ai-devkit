export interface TmuxRuntimeRef {
  session: string;
}

export function parseTmuxRuntimeRef(value: unknown): TmuxRuntimeRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session = (value as { session?: unknown }).session;
  return typeof session === "string" && session.trim() ? { session } : null;
}
