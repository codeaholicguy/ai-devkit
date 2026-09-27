import { pluralize } from "../../util/pluralize.js";

describe("pluralize util", () => {
  it("uses the singular word for exactly one item", () => {
    expect(pluralize(1, "provider")).toBe("1 provider");
  });

  it("appends s for other counts by default", () => {
    expect(pluralize(0, "provider")).toBe("0 providers");
    expect(pluralize(2, "provider")).toBe("2 providers");
  });

  it("uses an explicit plural word when provided", () => {
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
  });
});
