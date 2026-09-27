import chalk from "chalk";
import {
  colorStatus,
  getStatusDisplay,
  getStatusKeyByLabel,
  STATUS_DISPLAY,
} from "../../util/status.js";

describe("status util", () => {
  it("maps status keys to labels and colors", () => {
    expect(STATUS_DISPLAY.ok).toEqual({ label: "OK", color: "green" });
    expect(STATUS_DISPLAY.limited).toEqual({
      label: "LIMITED",
      color: "yellow",
    });
    expect(STATUS_DISPLAY["not-authenticated"]).toEqual({
      label: "NOT AUTHENTICATED",
      color: "yellow",
    });
    expect(STATUS_DISPLAY.exhausted).toEqual({
      label: "EXHAUSTED",
      color: "red",
    });
    expect(STATUS_DISPLAY.unknown).toEqual({
      label: "UNKNOWN",
      color: "dim",
    });
  });

  it("falls back to unknown display values for unsupported keys", () => {
    expect(getStatusDisplay("missing")).toEqual(STATUS_DISPLAY.unknown);
  });

  it("finds a status key by its display label", () => {
    expect(getStatusKeyByLabel("LIMITED")).toBe("limited");
    expect(getStatusKeyByLabel(" NOT AUTHENTICATED ")).toBe(
      "not-authenticated",
    );
    expect(getStatusKeyByLabel("missing")).toBe("unknown");
  });

  it("colors labels with the mapped chalk color", () => {
    expect(colorStatus("ok")).toBe(chalk.green("OK"));
    expect(colorStatus("missing")).toBe(chalk.dim("UNKNOWN"));
  });
});
