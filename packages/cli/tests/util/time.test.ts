import {
  formatLocalDate,
  parseDurationMs,
  parseFutureIsoTimestamp,
  parseMilliseconds,
} from "../../src/util/time.js";

describe("time util", () => {
  describe("formatLocalDate", () => {
    it("formats local dates as YYYY-MM-DD with zero-padded month and day", () => {
      expect(formatLocalDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
      expect(formatLocalDate(new Date(2026, 10, 15, 0, 30))).toBe("2026-11-15");
    });
  });

  describe("parseMilliseconds", () => {
    it("returns the default when the value is omitted", () => {
      expect(parseMilliseconds(undefined, 600000)).toEqual({ milliseconds: 600000 });
    });

    it("parses positive integer milliseconds and adds an ms label", () => {
      expect(parseMilliseconds("1500", 600000)).toEqual({
        milliseconds: 1500,
        label: "1500ms",
      });
    });

    it("trims surrounding whitespace", () => {
      expect(parseMilliseconds(" 30000 ", 600000)).toEqual({
        milliseconds: 30000,
        label: "30000ms",
      });
    });

    it("rejects zero, decimals, units, and non-numeric values", () => {
      const invalidValues = ["0", "1.5", "1.5s", "30s", "soon", "-1", ""];

      for (const value of invalidValues) {
        expect(() => parseMilliseconds(value, 600000)).toThrow(
          "Expected positive integer milliseconds.",
        );
      }
    });
  });

  describe("parseDurationMs", () => {
    it("parses single and compound durations case-insensitively", () => {
      expect(parseDurationMs("30s")).toBe(30_000);
      expect(parseDurationMs("15m")).toBe(15 * 60_000);
      expect(parseDurationMs("2h")).toBe(2 * 3_600_000);
      expect(parseDurationMs("1d")).toBe(86_400_000);
      expect(parseDurationMs(" 1H30m10s ")).toBe(3_600_000 + 30 * 60_000 + 10_000);
    });

    it("rejects bare numbers, zero, negatives, duplicate units, and >365d", () => {
      for (const bad of ["30", "0s", "0m", "-5m", "1h2h", "366d", "", "soon", "1.5h"]) {
        expect(() => parseDurationMs(bad)).toThrow(/Invalid --in duration/);
      }
    });
  });

  describe("parseFutureIsoTimestamp", () => {
    const now = Date.parse("2026-11-25T20:00:00.000Z");

    it("normalizes valid future UTC and offset timestamps to canonical UTC ISO", () => {
      expect(parseFutureIsoTimestamp("2026-11-25T21:00:00Z", now)).toBe("2026-11-25T21:00:00.000Z");
      expect(parseFutureIsoTimestamp("2026-11-25T16:30:00-05:00", now)).toBe(
        "2026-11-25T21:30:00.000Z",
      );
      expect(parseFutureIsoTimestamp("2026-11-25T20:05Z", now)).toBe("2026-11-25T20:05:00.000Z");
    });

    it("rejects missing timezone, rollover dates, and past timestamps", () => {
      for (const bad of [
        "2026-11-25T21:00:00",
        "2026-02-30T12:00:00Z",
        "2026-11-25",
        "tomorrow",
        "2026-11-25T21:00:00+25:00",
      ]) {
        expect(() => parseFutureIsoTimestamp(bad, now)).toThrow(/Invalid --at timestamp/);
      }
      expect(() => parseFutureIsoTimestamp("2026-11-25T20:00:00Z", now)).toThrow(
        "--at timestamp must be in the future.",
      );
      expect(() => parseFutureIsoTimestamp("2026-11-25T19:59:59Z", now)).toThrow(
        "--at timestamp must be in the future.",
      );
    });
  });
});
