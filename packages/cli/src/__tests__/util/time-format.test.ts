import {
  formatClockTime,
  formatRelativeOrAbsoluteTime,
} from "../../util/time-format.js";

const now = new Date("2026-08-09T10:00:00.000Z");
const localClock = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

describe("time format util", () => {
  it("formats local clock time as HH:mm", () => {
    expect(formatClockTime(new Date(2026, 0, 5, 3, 4))).toBe("03:04");
    expect(formatClockTime(new Date(2026, 0, 5, 23, 59))).toBe("23:59");
  });

  it("formats nearby future times with relative labels and clock time", () => {
    expect(
      formatRelativeOrAbsoluteTime("2026-08-09T10:05:00.000Z", {
        now: () => now,
      }),
    ).toBe(`in 5m · ${localClock(new Date("2026-08-09T10:05:00.000Z"))}`);
    expect(
      formatRelativeOrAbsoluteTime("2026-08-09T14:53:00.000Z", {
        now: () => now,
      }),
    ).toBe(`in 4h 53m · ${localClock(new Date("2026-08-09T14:53:00.000Z"))}`);
    expect(
      formatRelativeOrAbsoluteTime("2026-08-09T12:00:00.000Z", {
        now: () => now,
      }),
    ).toBe(`in 2h · ${localClock(new Date("2026-08-09T12:00:00.000Z"))}`);
  });

  it("formats nearby past times with relative labels and clock time", () => {
    expect(
      formatRelativeOrAbsoluteTime("2026-08-09T09:55:00.000Z", {
        now: () => now,
      }),
    ).toBe(`5m ago · ${localClock(new Date("2026-08-09T09:55:00.000Z"))}`);
    expect(
      formatRelativeOrAbsoluteTime("2026-08-09T07:07:00.000Z", {
        now: () => now,
      }),
    ).toBe(`2h 53m ago · ${localClock(new Date("2026-08-09T07:07:00.000Z"))}`);
  });

  it("formats distant times as Mon D plus clock time", () => {
    expect(
      formatRelativeOrAbsoluteTime("2026-09-01T00:52:00.000Z", {
        now: () => now,
      }),
    ).toBe(`Sep 1 · ${localClock(new Date("2026-09-01T00:52:00.000Z"))}`);
    expect(
      formatRelativeOrAbsoluteTime("2026-08-01T00:52:00.000Z", {
        now: () => now,
      }),
    ).toBe(`Aug 1 · ${localClock(new Date("2026-08-01T00:52:00.000Z"))}`);
  });

  it("returns fallback text for missing, invalid, or effectively current times", () => {
    expect(formatRelativeOrAbsoluteTime(null, { now: () => now })).toBe("—");
    expect(formatRelativeOrAbsoluteTime("nope", { now: () => now })).toBe("—");
    expect(
      formatRelativeOrAbsoluteTime("2026-08-09T10:00:10.000Z", {
        now: () => now,
      }),
    ).toBe("now");
  });
});
