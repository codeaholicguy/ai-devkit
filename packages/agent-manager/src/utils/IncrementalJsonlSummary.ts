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
 * const result = summaries.read(filePath); // { state, size, mtime, skippedBytes } | null
 * summaries.prune(); // once per refresh: evict paths not read since the last prune
 * ```
 *
 * Read rules, keyed by file path:
 * - dev, ino, size and mtimeMs unchanged → cached state, 0 bytes read.
 * - same dev/ino and size grew → read only the bytes after the last complete line.
 * - anything else (first read, shrink, rotation, in-place rewrite) → rebuild.
 *
 * A rebuild of a file larger than `headBytes + tailBytes` (default 1 MiB +
 * 4 MiB) is a bounded cold start rather than a full parse: it folds the
 * complete lines in `[0, headBytes)`, calls `reducer.skip(state)`, then folds
 * the lines that start inside `[size - tailBytes, size)`, including a line
 * that starts exactly at `size - tailBytes` (one extra byte before the window
 * is read to tell). Lines straddling a window edge are dropped. A field whose
 * entries all sit in the skipped middle keeps whatever `skip` leaves; there is
 * never a hidden full scan. The result's `skippedBytes` reports the unread
 * middle, and the cache is seeded at end of file so later appends stay
 * incremental.
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
 *
 * `skip` is called once when a bounded cold start skips the middle of a file,
 * between the head lines and the tail lines. It returns the state the tail
 * lines fold onto: keep what the head established (e.g. the first entry) and
 * reset fields that track the latest entry, so those come only from lines
 * actually read. Without `skip`, tail lines fold straight onto the head state.
 */
export interface JsonlSummaryReducer<S> {
  initial(): S;
  reduce(state: S, entry: unknown): S;
  skip?(state: S): S;
}

export interface JsonlSummaryResult<S> {
  state: S;
  /** File size in bytes when the state was computed. */
  size: number;
  /** File mtime (`fs.Stats.mtime`) when the state was computed. */
  mtime: Date;
  /** Bytes the bounded cold start did not read; 0 when the whole file was parsed. */
  skippedBytes: number;
}

export interface JsonlSummaryBounds {
  /** Bytes scanned from the start of the file on a cold start. */
  headBytes: number;
  /** Bytes scanned at the end of the file on a cold start. */
  tailBytes: number;
}

export interface IncrementalJsonlSummaryOptions {
  /** Bytes read per `fs.readSync` call. */
  chunkSize?: number;
  /** Cold-start scan bounds; `false` parses rebuilt files from byte 0. */
  bounds?: JsonlSummaryBounds | false;
}

interface CacheEntry<S> {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  mtime: Date;
  /** Byte offset just past the last newline folded into `committed`. */
  offset: number;
  /** `offset` is mid-line: drop bytes up to and including the next newline. */
  discarding: boolean;
  /** State after every newline-terminated line. */
  committed: S;
  /** `committed` plus the unterminated last line, when it parses as JSON. */
  state: S;
  /** Bytes the cold start did not read. */
  skippedBytes: number;
  /** Prune generation in which this entry was last read. */
  seen: number;
}

export const DEFAULT_HEAD_BYTES = 1024 * 1024;
export const DEFAULT_TAIL_BYTES = 4 * 1024 * 1024;
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
  private readonly bounds: JsonlSummaryBounds | false;
  private generation = 0;

  constructor(
    private readonly reducer: JsonlSummaryReducer<S>,
    options: IncrementalJsonlSummaryOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.bounds = options.bounds ?? {
      headBytes: DEFAULT_HEAD_BYTES,
      tailBytes: DEFAULT_TAIL_BYTES,
    };
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

    const appended = sameFile && stat.size > cached.size;
    const entry: CacheEntry<S> = appended
      ? { ...cached }
      : {
          dev: stat.dev,
          ino: stat.ino,
          size: 0,
          mtimeMs: 0,
          mtime: stat.mtime,
          offset: 0,
          discarding: false,
          committed: this.reducer.initial(),
          state: this.reducer.initial(),
          skippedBytes: 0,
          seen: this.generation,
        };

    try {
      const fd = fs.openSync(filePath, "r");
      try {
        const bounds = this.bounds;
        if (!appended && bounds && stat.size > bounds.headBytes + bounds.tailBytes) {
          this.readBounded(fd, entry, stat.size, bounds);
        } else {
          this.readRange(fd, entry, stat.size);
        }
      } finally {
        fs.closeSync(fd);
      }
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

  /** Cold start: fold the head lines, `skip`, then the lines starting in the tail window. */
  private readBounded(
    fd: number,
    entry: CacheEntry<S>,
    size: number,
    { headBytes, tailBytes }: JsonlSummaryBounds,
  ): void {
    this.readRange(fd, entry, headBytes);

    const tailStart = size - tailBytes;
    const head = entry.committed;
    entry.committed = this.reducer.skip ? this.reducer.skip(head) : head;
    // Lines are only folded from their first byte, and tailStart may fall
    // mid-line. Discard from one byte earlier (tailStart > headBytes >= 0): if
    // that byte is the newline ending the previous line, discarding stops there
    // and the line starting at tailStart is folded; otherwise the partial line
    // is dropped up to its newline.
    entry.offset = tailStart - 1;
    entry.discarding = true;
    entry.skippedBytes = tailStart - headBytes;
    this.readRange(fd, entry, size);
  }

  /** Fold complete lines in `[entry.offset, end)` into `entry`. */
  private readRange(fd: number, entry: CacheEntry<S>, end: number): void {
    const chunk = Buffer.allocUnsafe(Math.min(this.chunkSize, Math.max(end - entry.offset, 1)));
    let position = entry.offset;
    let carry: Buffer | undefined;
    let committed = entry.committed;
    let discarding = entry.discarding;

    while (position < end) {
      const bytesRead = fs.readSync(fd, chunk, 0, Math.min(chunk.length, end - position), position);
      if (bytesRead === 0) break;
      position += bytesRead;

      let lineStart = 0;
      let newline = chunk.indexOf(NEWLINE, 0);
      while (newline !== -1 && newline < bytesRead) {
        if (discarding) {
          discarding = false;
        } else {
          const lineBytes = carry
            ? Buffer.concat([carry, chunk.subarray(lineStart, newline)])
            : chunk.subarray(lineStart, newline);
          committed = reduceLine(this.reducer, committed, lineBytes.toString("utf8"));
        }
        carry = undefined;
        lineStart = newline + 1;
        newline = chunk.indexOf(NEWLINE, lineStart);
      }

      if (lineStart < bytesRead && !discarding) {
        const rest = Buffer.from(chunk.subarray(lineStart, bytesRead));
        carry = carry ? Buffer.concat([carry, rest]) : rest;
      }
    }

    entry.committed = committed;
    entry.discarding = discarding;
    entry.offset = position - (carry?.length ?? 0);
    entry.size = position;
    entry.state = carry
      ? reduceTentative(this.reducer, committed, carry.toString("utf8"))
      : committed;
  }
}

function toResult<S>(entry: CacheEntry<S>): JsonlSummaryResult<S> {
  return {
    state: entry.state,
    size: entry.size,
    mtime: entry.mtime,
    skippedBytes: entry.skippedBytes,
  };
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
