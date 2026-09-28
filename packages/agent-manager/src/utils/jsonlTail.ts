/**
 * Tail reader for append-only JSONL transcripts.
 *
 * Reading the last N conversation messages from a large transcript should not
 * require reading (and JSON-parsing) the whole file. This reader:
 *
 * 1. On the first call for a file, reads backward from the end in fixed-size
 *    chunks until enough messages are collected (or the start is reached).
 * 2. Remembers `{dev, ino, offset}` plus a small window of parsed items, and
 *    on later calls parses only bytes appended since `offset`.
 * 3. Resets (re-reads from the end) when the file is truncated or replaced by
 *    a different inode.
 *
 * Each adapter supplies a {@link JsonlTailSource}: `parseLine` maps one raw
 * line to a candidate item (or null) and the optional `finalize` turns a
 * contiguous window of items into messages. `finalize` exists for formats
 * where one line's visibility depends on other lines (e.g. Codex drops an
 * `event_msg` mirrored by a `response_item`); line-independent formats can
 * omit it and return a {@link ConversationMessage} directly from `parseLine`.
 */

import * as fs from "fs";
import type { ConversationMessage } from "../adapters/AgentAdapter.js";

/**
 * Normalize a `tail` option: a positive integer, or undefined for "full
 * conversation" (the pre-existing behaviour).
 */
export function normalizeTail(tail: number | undefined): number | undefined {
  if (tail === undefined || !Number.isFinite(tail)) return undefined;
  const n = Math.floor(tail);
  return n > 0 ? n : undefined;
}

/** Keep the last `tail` messages of an already fully-parsed conversation. */
export function sliceTail<T>(messages: T[], tail: number | undefined): T[] {
  const n = normalizeTail(tail);
  return n !== undefined && messages.length > n ? messages.slice(-n) : messages;
}

export const DEFAULT_TAIL_CHUNK_SIZE = 64 * 1024;
const DEFAULT_MAX_FILES = 16;
const NEWLINE = 0x0a;
const ANCHOR_BYTES = 32;

export interface JsonlTailSource<Item> {
  /** Map one raw JSONL line (no trailing newline) to an item, or null to skip it. */
  parseLine(line: string): Item | null;
  /**
   * Convert a contiguous window of items (oldest first) into messages. Must
   * behave like the adapter's full parse restricted to that window. Defaults
   * to treating every item as a {@link ConversationMessage}.
   */
  finalize?(items: Item[]): ConversationMessage[];
}

export interface JsonlTailReaderOptions {
  /** Bytes read per backward step. Defaults to 64 KiB. */
  chunkSize?: number;
  /** Number of (file, variant, tail) windows kept in the LRU cache. */
  maxFiles?: number;
}

interface TailState {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  /** Byte offset just past the last newline consumed; appends are read from here. */
  offset: number;
  /**
   * Up to {@link ANCHOR_BYTES} bytes ending at `offset`. Re-checked before an
   * incremental read so a same-inode truncate-and-regrow is detected.
   */
  anchor: Buffer;
  /** Parsed items from complete (newline-terminated) lines, oldest first. */
  items: unknown[];
  /** Last computed result, returned as-is while the file is unchanged. */
  result: ConversationMessage[];
}

export class JsonlTailReader {
  private readonly chunkSize: number;
  private readonly maxFiles: number;
  private readonly cache = new Map<string, TailState>();

  constructor(options: JsonlTailReaderOptions = {}) {
    this.chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_TAIL_CHUNK_SIZE);
    this.maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
  }

  /**
   * Return the last `tail` messages of `filePath`.
   *
   * @param variant  Cache discriminator for sources whose output differs by
   *                 option (e.g. verbose vs. non-verbose).
   * @param overscan Extra messages collected beyond `tail` before trimming,
   *                 for sources whose `finalize` looks at neighbouring lines.
   */
  read<Item>(
    filePath: string,
    tail: number,
    source: JsonlTailSource<Item>,
    variant = "",
    overscan = 0,
  ): ConversationMessage[] {
    const key = `${variant}\0${tail}\0${filePath}`;
    const threshold = tail + Math.max(0, overscan);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      this.cache.delete(key);
      return [];
    }

    const cached = this.cache.get(key);
    if (
      cached &&
      cached.dev === stat.dev &&
      cached.ino === stat.ino &&
      cached.size === stat.size &&
      cached.mtimeMs === stat.mtimeMs
    ) {
      this.touch(key, cached);
      return cached.result.slice();
    }

    let fd: number;
    try {
      fd = fs.openSync(filePath, "r");
    } catch {
      this.cache.delete(key);
      return [];
    }

    try {
      const current = fs.fstatSync(fd);
      const canAppend =
        cached !== undefined &&
        cached.dev === current.dev &&
        cached.ino === current.ino &&
        current.size >= cached.offset &&
        // A very large append is cheaper to re-read from the end.
        current.size - cached.offset <= Math.max(this.chunkSize * 16, 1024 * 1024);

      const state =
        (canAppend && this.readAppended(fd, current, cached, tail, threshold, source)) ||
        this.readBackward(fd, current, tail, threshold, source);
      this.touch(key, state);
      return state.result.slice();
    } catch {
      this.cache.delete(key);
      return [];
    } finally {
      fs.closeSync(fd);
    }
  }

  /** Forget all cached windows. */
  clear(): void {
    this.cache.clear();
  }

  private readBackward<Item>(
    fd: number,
    stat: fs.Stats,
    tail: number,
    threshold: number,
    source: JsonlTailSource<Item>,
  ): TailState {
    const reversed: Item[] = [];
    let partial: Item | null = null;
    let offset = 0;
    let sawNewline = false;
    // Pieces of the line currently being assembled, in file order.
    let pending: Buffer[] = [];
    let pos = stat.size;

    const takeLine = (piece: Buffer): void => {
      const lineBuf = pending.length === 0 ? piece : Buffer.concat([piece, ...pending]);
      pending = [];
      if (!sawNewline) {
        // Bytes after the file's last newline: an unterminated (possibly
        // still being written) line. Parsed tentatively, never cached.
        sawNewline = true;
        partial = this.parse(lineBuf, source);
        return;
      }
      const item = this.parse(lineBuf, source);
      if (item !== null) reversed.push(item);
    };

    while (pos > 0) {
      const len = Math.min(this.chunkSize, pos);
      pos -= len;
      const buf = readExactly(fd, pos, len);

      let end = len;
      let nl = end > 0 ? buf.lastIndexOf(NEWLINE, end - 1) : -1;
      while (nl !== -1) {
        if (!sawNewline) offset = pos + nl + 1;
        takeLine(buf.subarray(nl + 1, end));
        end = nl;
        nl = end > 0 ? buf.lastIndexOf(NEWLINE, end - 1) : -1;
      }
      if (end > 0) pending.unshift(buf.subarray(0, end));

      if (this.countMessages(reversed, partial, source, threshold) >= threshold) break;
    }

    if (pos === 0 && pending.length > 0) {
      // The first line of the file (no newline before it).
      const first = pending.shift()!;
      takeLine(first);
    }

    const items = reversed.reverse();
    return {
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      offset,
      anchor: readAnchor(fd, offset),
      items,
      result: this.finish(items, partial, source, tail),
    };
  }

  /**
   * Parse bytes appended since the cached offset. Returns null when the
   * bytes before the offset no longer match (file rewritten in place).
   */
  private readAppended<Item>(
    fd: number,
    stat: fs.Stats,
    cached: TailState,
    tail: number,
    threshold: number,
    source: JsonlTailSource<Item>,
  ): TailState | null {
    let items = cached.items as Item[];
    let offset = cached.offset;
    let partial: Item | null = null;

    const anchorLength = cached.anchor.length;
    const raw = readExactly(fd, cached.offset - anchorLength, stat.size - offset + anchorLength);
    if (!raw.subarray(0, anchorLength).equals(cached.anchor)) return null;
    const buf = raw.subarray(anchorLength);
    let anchor = cached.anchor;

    if (buf.length > 0) {
      const added: Item[] = [];
      let start = 0;
      let nl = buf.indexOf(NEWLINE, start);
      while (nl !== -1) {
        const item = this.parse(buf.subarray(start, nl), source);
        if (item !== null) added.push(item);
        start = nl + 1;
        nl = buf.indexOf(NEWLINE, start);
      }
      offset = cached.offset + start;
      if (start > 0) anchor = tailBytes(raw.subarray(0, anchorLength + start));
      if (start < buf.length) partial = this.parse(buf.subarray(start), source);

      if (added.length > 0) {
        items = items.concat(added);
        // Bound the retained window; keep a generous margin so sources whose
        // finalize() drops items (e.g. de-duplication) still cover `tail`.
        if (items.length > threshold * 4) items = items.slice(-threshold * 2);
      }
    }

    return {
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      offset,
      anchor,
      items,
      result: this.finish(items, partial, source, tail),
    };
  }

  private parse<Item>(lineBuf: Buffer, source: JsonlTailSource<Item>): Item | null {
    const line = lineBuf.toString("utf-8");
    if (line.trim().length === 0) return null;
    return source.parseLine(line);
  }

  private countMessages<Item>(
    reversed: Item[],
    partial: Item | null,
    source: JsonlTailSource<Item>,
    threshold: number,
  ): number {
    const available = reversed.length + (partial === null ? 0 : 1);
    if (!source.finalize || available < threshold) return available;
    const window = reversed.slice().reverse();
    if (partial !== null) window.push(partial);
    return source.finalize(window).length;
  }

  private finish<Item>(
    items: Item[],
    partial: Item | null,
    source: JsonlTailSource<Item>,
    tail: number,
  ): ConversationMessage[] {
    const window = partial === null ? items : [...items, partial];
    const messages = source.finalize
      ? source.finalize(window)
      : (window as unknown as ConversationMessage[]).slice();
    return messages.length > tail ? messages.slice(-tail) : messages;
  }

  private touch(key: string, state: TailState): void {
    this.cache.delete(key);
    this.cache.set(key, state);
    while (this.cache.size > this.maxFiles) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

function readExactly(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.allocUnsafe(length);
  let filled = 0;
  while (filled < length) {
    const n = fs.readSync(fd, buf, filled, length - filled, position + filled);
    if (n === 0) break;
    filled += n;
  }
  return filled === length ? buf : buf.subarray(0, filled);
}

function readAnchor(fd: number, offset: number): Buffer {
  const start = Math.max(0, offset - ANCHOR_BYTES);
  return Buffer.from(readExactly(fd, start, offset - start));
}

function tailBytes(buf: Buffer): Buffer {
  return Buffer.from(buf.subarray(Math.max(0, buf.length - ANCHOR_BYTES)));
}
