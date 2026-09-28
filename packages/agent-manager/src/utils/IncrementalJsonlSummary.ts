/**
 * Incremental JSONL Summary
 *
 * Keeps a small per-file summary of append-only JSONL transcripts so repeated
 * refreshes only parse bytes that were appended since the previous read.
 *
 * Usage:
 * ```ts
 * const summaries = new IncrementalJsonlSummary<MyState>({
 *   initial: () => ({ lastType: undefined }),
 *   reduce: (state, entry) => ({ ...state, lastType: (entry as any)?.type }),
 * });
 *
 * const result = summaries.read(filePath); // { state, size, mtime } | null
 * summaries.prune(); // once per refresh: evict paths not read since the last prune
 * ```
 *
 * Read rules, keyed by file path:
 * - dev, ino, size and mtimeMs unchanged → cached state, 0 bytes read.
 * - same dev/ino and size grew → read only the bytes after the last complete line.
 * - anything else (shrink, rotation, in-place rewrite) → rebuild from byte 0.
 *
 * An unterminated last line is never folded into the committed state. If it
 * already parses as JSON it is applied to the returned state only, and it is
 * re-read (from its start offset) once more bytes arrive.
 */

import * as fs from "fs";

/**
 * Pure fold over the entries of a JSONL file.
 *
 * `reduce` receives each non-blank line in file order: the parsed JSON value,
 * or `undefined` when the line is not valid JSON. It must return a new state
 * rather than mutate `state`, and the state should stay O(1) in file size
 * (no entry arrays or raw file contents).
 */
export interface JsonlSummaryReducer<S> {
  initial(): S;
  reduce(state: S, entry: unknown): S;
}

export interface JsonlSummaryResult<S> {
  state: S;
  /** File size in bytes when the state was computed. */
  size: number;
  /** File mtime (`fs.Stats.mtime`) when the state was computed. */
  mtime: Date;
}

export interface IncrementalJsonlSummaryOptions {
  /** Bytes read per `fs.readSync` call. */
  chunkSize?: number;
}

interface CacheEntry<S> {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  mtime: Date;
  /** Byte offset just past the last newline folded into `committed`. */
  offset: number;
  /** State after every newline-terminated line. */
  committed: S;
  /** `committed` plus the unterminated last line, when it parses as JSON. */
  state: S;
  /** Prune generation in which this entry was last read. */
  seen: number;
}

const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const NEWLINE = 0x0a;

/** Fold a whole JSONL string with a reducer (one-shot, uncached). */
export function reduceJsonlContent<S>(reducer: JsonlSummaryReducer<S>, content: string): S {
  let state = reducer.initial();
  for (const line of content.split("\n")) {
    state = reduceLine(reducer, state, line);
  }
  return state;
}

export class IncrementalJsonlSummary<S> {
  private readonly entries = new Map<string, CacheEntry<S>>();
  private readonly chunkSize: number;
  private generation = 0;

  constructor(
    private readonly reducer: JsonlSummaryReducer<S>,
    options: IncrementalJsonlSummaryOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  }

  /** Number of cached files. */
  get size(): number {
    return this.entries.size;
  }

  /** Return the summary of `filePath`, reading only what changed. Null if unreadable. */
  read(filePath: string): JsonlSummaryResult<S> | null {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      this.entries.delete(filePath);
      return null;
    }

    const cached = this.entries.get(filePath);
    const sameFile = cached !== undefined && cached.dev === stat.dev && cached.ino === stat.ino;

    if (sameFile && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      cached.seen = this.generation;
      return toResult(cached);
    }

    const entry: CacheEntry<S> =
      sameFile && stat.size > cached.size
        ? { ...cached }
        : {
            dev: stat.dev,
            ino: stat.ino,
            size: 0,
            mtimeMs: 0,
            mtime: stat.mtime,
            offset: 0,
            committed: this.reducer.initial(),
            state: this.reducer.initial(),
            seen: this.generation,
          };

    try {
      this.readTail(filePath, entry, stat.size);
    } catch {
      this.entries.delete(filePath);
      return null;
    }

    entry.mtimeMs = stat.mtimeMs;
    entry.mtime = stat.mtime;
    entry.seen = this.generation;
    this.entries.set(filePath, entry);
    return toResult(entry);
  }

  /** Evict entries not read since the previous `prune()` call. Call once per refresh. */
  prune(): void {
    for (const [filePath, entry] of this.entries) {
      if (entry.seen !== this.generation) {
        this.entries.delete(filePath);
      }
    }
    this.generation++;
  }

  /** Fold complete lines in `[entry.offset, size)` into `entry`. */
  private readTail(filePath: string, entry: CacheEntry<S>, size: number): void {
    const fd = fs.openSync(filePath, "r");
    try {
      const chunk = Buffer.allocUnsafe(Math.min(this.chunkSize, Math.max(size - entry.offset, 1)));
      let position = entry.offset;
      let carry: Buffer | undefined;
      let committed = entry.committed;

      while (position < size) {
        const bytesRead = fs.readSync(
          fd,
          chunk,
          0,
          Math.min(chunk.length, size - position),
          position,
        );
        if (bytesRead === 0) break;
        position += bytesRead;

        let lineStart = 0;
        let newline = chunk.indexOf(NEWLINE, 0);
        while (newline !== -1 && newline < bytesRead) {
          const lineBytes = carry
            ? Buffer.concat([carry, chunk.subarray(lineStart, newline)])
            : chunk.subarray(lineStart, newline);
          carry = undefined;
          committed = reduceLine(this.reducer, committed, lineBytes.toString("utf8"));
          lineStart = newline + 1;
          newline = chunk.indexOf(NEWLINE, lineStart);
        }

        if (lineStart < bytesRead) {
          const rest = Buffer.from(chunk.subarray(lineStart, bytesRead));
          carry = carry ? Buffer.concat([carry, rest]) : rest;
        }
      }

      const tailLength = carry?.length ?? 0;
      entry.committed = committed;
      entry.offset = position - tailLength;
      entry.size = position;
      entry.state = carry
        ? reduceTentative(this.reducer, committed, carry.toString("utf8"))
        : committed;
    } finally {
      fs.closeSync(fd);
    }
  }
}

function toResult<S>(entry: CacheEntry<S>): JsonlSummaryResult<S> {
  return { state: entry.state, size: entry.size, mtime: entry.mtime };
}

function reduceLine<S>(reducer: JsonlSummaryReducer<S>, state: S, line: string): S {
  if (!/\S/.test(line)) return state;
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    entry = undefined;
  }
  return reducer.reduce(state, entry);
}

/** Apply an unterminated line only if it is already valid JSON (i.e. fully written). */
function reduceTentative<S>(reducer: JsonlSummaryReducer<S>, state: S, line: string): S {
  if (!/\S/.test(line)) return state;
  try {
    return reducer.reduce(state, JSON.parse(line));
  } catch {
    return state;
  }
}
