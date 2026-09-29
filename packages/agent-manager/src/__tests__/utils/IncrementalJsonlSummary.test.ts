import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  DEFAULT_HEAD_BYTES,
  DEFAULT_TAIL_BYTES,
  IncrementalJsonlSummary,
  reduceJsonlContent,
  type JsonlSummaryReducer,
} from "../../utils/IncrementalJsonlSummary.js";

vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs");
  return { ...actual, readSync: vi.fn(actual.readSync), readFileSync: vi.fn(actual.readFileSync) };
});

const mockedReadSync = vi.mocked(fs.readSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);

/** Records every parsed entry (malformed lines as "<bad>") plus a running count. */
interface RecordingState {
  count: number;
  entries: unknown[];
}

const recordingReducer: JsonlSummaryReducer<RecordingState> = {
  initial: () => ({ count: 0, entries: [] }),
  reduce: (state, entry) => ({
    count: state.count + 1,
    entries: [...state.entries, entry === undefined ? "<bad>" : entry],
  }),
};

function bytesRead(): number {
  let total = 0;
  for (const result of mockedReadSync.mock.results) {
    if (result.type === "return") total += result.value as number;
  }
  for (const result of mockedReadFileSync.mock.results) {
    if (result.type === "return") total += Buffer.byteLength(result.value as string | Buffer);
  }
  return total;
}

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

describe("reduceJsonlContent", () => {
  it("folds non-blank lines, passing undefined for malformed JSON", () => {
    const state = reduceJsonlContent(recordingReducer, '\n  \n{"a":1}\nnot json\n\n{"b":2}');
    expect(state.entries).toEqual([{ a: 1 }, "<bad>", { b: 2 }]);
  });

  it("returns the initial state for empty content", () => {
    expect(reduceJsonlContent(recordingReducer, "")).toEqual({ count: 0, entries: [] });
  });
});

describe("IncrementalJsonlSummary", () => {
  let tmpDir: string;
  let filePath: string;
  let cache: IncrementalJsonlSummary<RecordingState>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incremental-jsonl-"));
    filePath = path.join(tmpDir, "session.jsonl");
    cache = new IncrementalJsonlSummary(recordingReducer);
    mockedReadSync.mockClear();
    mockedReadFileSync.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null for a missing file", () => {
    expect(cache.read(path.join(tmpDir, "missing.jsonl"))).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("summarizes a file and reports its size and mtime", () => {
    fs.writeFileSync(filePath, line({ a: 1 }) + line({ b: 2 }));
    const stat = fs.statSync(filePath);

    const result = cache.read(filePath);

    expect(result?.state.entries).toEqual([{ a: 1 }, { b: 2 }]);
    expect(result?.size).toBe(stat.size);
    expect(result?.mtime).toEqual(stat.mtime);
  });

  it("reads 0 bytes when the file is unchanged", () => {
    fs.writeFileSync(filePath, line({ a: 1 }) + line({ b: 2 }));
    const first = cache.read(filePath);
    mockedReadSync.mockClear();
    mockedReadFileSync.mockClear();

    const second = cache.read(filePath);

    expect(bytesRead()).toBe(0);
    expect(second?.state).toEqual(first?.state);
  });

  it("reads only the appended bytes when the file grows", () => {
    fs.writeFileSync(filePath, line({ a: "x".repeat(200_000) }));
    cache.read(filePath);
    mockedReadSync.mockClear();

    const appended = line({ b: 2 }) + line({ c: 3 });
    fs.appendFileSync(filePath, appended);
    const result = cache.read(filePath);

    expect(bytesRead()).toBe(Buffer.byteLength(appended));
    expect(result?.state.entries.slice(1)).toEqual([{ b: 2 }, { c: 3 }]);
    expect(result?.state.count).toBe(3);
  });

  it("handles lines spanning read chunks and multi-byte characters", () => {
    const small = new IncrementalJsonlSummary(recordingReducer, { chunkSize: 7 });
    const entries = [{ text: "héllo wörld 👋" }, { text: "日本語のテキスト" }, { n: 3 }];
    fs.writeFileSync(filePath, entries.map(line).join(""));

    expect(small.read(filePath)?.state.entries).toEqual(entries);
  });

  it("does not reduce an unterminated line until it is complete, without duplicating it", () => {
    fs.writeFileSync(filePath, line({ a: 1 }) + '{"b":');
    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }]);

    fs.appendFileSync(filePath, "2");
    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }]);

    fs.appendFileSync(filePath, "}\n");
    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }, { b: 2 }]);

    fs.appendFileSync(filePath, line({ c: 3 }));
    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("includes a valid unterminated last line in the result but re-reads it once terminated", () => {
    fs.writeFileSync(filePath, line({ a: 1 }) + '{"b":2}');
    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }, { b: 2 }]);

    fs.appendFileSync(filePath, "\n" + line({ c: 3 }));
    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("matches a one-shot fold for every split point of an appended file", () => {
    const content = [
      line({ a: 1 }),
      "\n",
      "garbage\n",
      line({ b: "ünïcode" }),
      line({ c: [1, 2, 3] }),
      '{"d":4}',
    ].join("");
    const buffer = Buffer.from(content);
    const expected = reduceJsonlContent(recordingReducer, content);

    for (let split = 0; split <= buffer.length; split++) {
      const splitCache = new IncrementalJsonlSummary(recordingReducer, { chunkSize: 5 });
      fs.writeFileSync(filePath, buffer.subarray(0, split));
      splitCache.read(filePath);
      fs.appendFileSync(filePath, buffer.subarray(split));
      expect(splitCache.read(filePath)?.state).toEqual(expected);
    }
  });

  it("rebuilds when the file shrinks", () => {
    fs.writeFileSync(filePath, line({ a: 1 }) + line({ b: 2 }));
    cache.read(filePath);

    fs.writeFileSync(filePath, line({ z: 9 }));

    expect(cache.read(filePath)?.state.entries).toEqual([{ z: 9 }]);
  });

  it("rebuilds when the file is replaced by a different inode", () => {
    fs.writeFileSync(filePath, line({ a: 1 }));
    cache.read(filePath);

    const replacement = path.join(tmpDir, "replacement.jsonl");
    fs.writeFileSync(replacement, line({ a: 1 }) + line({ rotated: true }));
    fs.renameSync(replacement, filePath);

    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }, { rotated: true }]);
  });

  it("rebuilds when the size is unchanged but the mtime moved", () => {
    fs.writeFileSync(filePath, line({ a: 1 }));
    cache.read(filePath);

    fs.writeFileSync(filePath, line({ b: 2 }));
    const future = new Date(Date.now() + 10_000);
    fs.utimesSync(filePath, future, future);

    expect(cache.read(filePath)?.state.entries).toEqual([{ b: 2 }]);
  });

  it("drops the entry when a cached file disappears", () => {
    fs.writeFileSync(filePath, line({ a: 1 }));
    cache.read(filePath);
    fs.rmSync(filePath);

    expect(cache.read(filePath)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("evicts entries not read since the previous prune", () => {
    const other = path.join(tmpDir, "other.jsonl");
    fs.writeFileSync(filePath, line({ a: 1 }));
    fs.writeFileSync(other, line({ b: 2 }));

    cache.read(filePath);
    cache.read(other);
    cache.prune();
    expect(cache.size).toBe(2);

    cache.read(filePath);
    cache.prune();
    expect(cache.size).toBe(1);

    cache.prune();
    expect(cache.size).toBe(0);
  });

  it("keeps only reducer state and stat metadata per entry", () => {
    fs.writeFileSync(filePath, line({ a: "x".repeat(10_000) }) + '{"partial":');
    cache.read(filePath);

    const entry = (cache as any).entries.get(filePath);
    expect(Object.keys(entry).sort()).toEqual(
      [
        "committed",
        "dev",
        "discarding",
        "ino",
        "mtime",
        "mtimeMs",
        "offset",
        "seen",
        "size",
        "skippedBytes",
        "state",
      ].sort(),
    );
  });
});

describe("IncrementalJsonlSummary bounded cold start", () => {
  let tmpDir: string;
  let filePath: string;

  /** Records entries plus how many times the middle of the file was skipped. */
  interface GapState extends RecordingState {
    gaps: number;
  }
  const gapReducer: JsonlSummaryReducer<GapState> = {
    initial: () => ({ count: 0, entries: [], gaps: 0 }),
    reduce: (state, entry) => ({
      ...state,
      count: state.count + 1,
      entries: [...state.entries, entry === undefined ? "<bad>" : entry],
    }),
    skip: (state) => ({ ...state, gaps: state.gaps + 1 }),
  };

  const bounds = { headBytes: 64, tailBytes: 128 };
  const pad = (n: number) => line({ pad: "p".repeat(n) });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounded-jsonl-"));
    filePath = path.join(tmpDir, "session.jsonl");
    mockedReadSync.mockClear();
    mockedReadFileSync.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses the whole file when it fits within head + tail", () => {
    const content = line({ a: 1 }) + pad(100) + line({ z: 9 });
    expect(Buffer.byteLength(content)).toBeLessThanOrEqual(192);
    fs.writeFileSync(filePath, content);

    const result = new IncrementalJsonlSummary(gapReducer, { bounds }).read(filePath);

    expect(result?.state).toEqual(reduceJsonlContent(gapReducer, content));
    expect(result?.skippedBytes).toBe(0);
  });

  it("folds head lines, then skip(), then tail lines, reading at most head + tail + 1 bytes", () => {
    const tail = line({ y: 8 }) + line({ z: 9 });
    const content = line({ a: 1 }) + pad(40) + pad(1000) + pad(40) + tail;
    fs.writeFileSync(filePath, content);

    const result = new IncrementalJsonlSummary(gapReducer, { bounds }).read(filePath);

    // +1: the byte before the tail window tells whether it starts on a line boundary
    expect(bytesRead()).toBeLessThanOrEqual(bounds.headBytes + bounds.tailBytes + 1);
    expect(result?.state.gaps).toBe(1);
    expect(result?.state.entries[0]).toEqual({ a: 1 });
    expect(result?.state.entries.slice(-2)).toEqual([{ y: 8 }, { z: 9 }]);
    expect(result?.state.entries).not.toContainEqual({ pad: "p".repeat(1000) });
    expect(result?.size).toBe(Buffer.byteLength(content));
    expect(result?.skippedBytes).toBe(Buffer.byteLength(content) - 64 - 128);
  });

  it("drops lines that straddle the head cap or the tail window start", () => {
    const content = line({ a: 1 }) + pad(500) + line({ z: 9 });
    fs.writeFileSync(filePath, content);

    const result = new IncrementalJsonlSummary(gapReducer, { bounds }).read(filePath);

    expect(result?.state.entries).toEqual([{ a: 1 }, { z: 9 }]);
  });

  it("folds the first tail line when the tail window starts exactly on a line boundary", () => {
    const tail = line({ y: 8 }) + line({ z: 9 });
    fs.writeFileSync(filePath, line({ a: 1 }) + pad(1000) + tail);

    const result = new IncrementalJsonlSummary(gapReducer, {
      bounds: { headBytes: 64, tailBytes: Buffer.byteLength(tail) },
    }).read(filePath);

    expect(result?.skippedBytes).toBeGreaterThan(0);
    expect(result?.state.entries).toEqual([{ a: 1 }, { y: 8 }, { z: 9 }]);
  });

  it("still drops the partial line when the tail window starts one byte into it", () => {
    const tail = line({ y: 8 }) + line({ z: 9 });
    fs.writeFileSync(filePath, line({ a: 1 }) + pad(1000) + tail);

    const result = new IncrementalJsonlSummary(gapReducer, {
      bounds: { headBytes: 64, tailBytes: Buffer.byteLength(tail) - 1 },
    }).read(filePath);

    expect(result?.state.entries).toEqual([{ a: 1 }, { z: 9 }]);
  });

  it("folds nothing from a tail window that holds no line start", () => {
    const content = line({ a: 1 }) + line({ big: "b".repeat(1000) });
    fs.writeFileSync(filePath, content);

    const result = new IncrementalJsonlSummary(gapReducer, { bounds }).read(filePath);

    expect(result?.state.entries).toEqual([{ a: 1 }]);
    expect(result?.state.gaps).toBe(1);
  });

  it("seeds the cache at end of file, so later appends read only the new bytes", () => {
    const cache = new IncrementalJsonlSummary(gapReducer, { bounds });
    fs.writeFileSync(filePath, line({ a: 1 }) + pad(1000) + line({ z: 9 }));
    cache.read(filePath);
    mockedReadSync.mockClear();

    const appended = line({ n: 10 });
    fs.appendFileSync(filePath, appended);
    const result = cache.read(filePath);

    expect(bytesRead()).toBe(Buffer.byteLength(appended));
    expect(result?.state.entries.slice(-2)).toEqual([{ z: 9 }, { n: 10 }]);
    expect(result?.state.gaps).toBe(1);
    expect(result?.skippedBytes).toBeGreaterThan(0);
  });

  it("resynchronises on the next newline when the tail window ended inside a line", () => {
    const cache = new IncrementalJsonlSummary(gapReducer, { bounds });
    fs.writeFileSync(filePath, line({ a: 1 }) + '{"big":"' + "b".repeat(1000));
    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }]);

    fs.appendFileSync(filePath, '"}\n' + line({ n: 10 }));

    expect(cache.read(filePath)?.state.entries).toEqual([{ a: 1 }, { n: 10 }]);
  });

  it("uses the bounded scan again when rebuilding a replaced file", () => {
    const cache = new IncrementalJsonlSummary(gapReducer, { bounds });
    fs.writeFileSync(filePath, line({ a: 1 }));
    cache.read(filePath);

    const replacement = path.join(tmpDir, "replacement.jsonl");
    fs.writeFileSync(replacement, line({ b: 2 }) + pad(1000) + line({ z: 9 }));
    fs.renameSync(replacement, filePath);
    mockedReadSync.mockClear();

    const result = cache.read(filePath);
    // +1: the byte before the tail window tells whether it starts on a line boundary
    expect(bytesRead()).toBeLessThanOrEqual(bounds.headBytes + bounds.tailBytes + 1);
    expect(result?.state.entries).toEqual([{ b: 2 }, { z: 9 }]);
  });

  it("folds tail lines straight onto the head state when the reducer has no skip()", () => {
    fs.writeFileSync(filePath, line({ a: 1 }) + pad(1000) + line({ z: 9 }));
    const result = new IncrementalJsonlSummary(recordingReducer, { bounds }).read(filePath);
    expect(result?.state).toEqual({ count: 2, entries: [{ a: 1 }, { z: 9 }] });
  });

  it("parses from byte 0 when bounds are disabled", () => {
    const content = line({ a: 1 }) + pad(1000) + line({ z: 9 });
    fs.writeFileSync(filePath, content);
    const result = new IncrementalJsonlSummary(gapReducer, { bounds: false }).read(filePath);
    expect(result?.state).toEqual(reduceJsonlContent(gapReducer, content));
    expect(result?.skippedBytes).toBe(0);
  });

  it("defaults to a 1 MiB head and 4 MiB tail", () => {
    expect(DEFAULT_HEAD_BYTES).toBe(1024 * 1024);
    expect(DEFAULT_TAIL_BYTES).toBe(4 * 1024 * 1024);
  });
});
