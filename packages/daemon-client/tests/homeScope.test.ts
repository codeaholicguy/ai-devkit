import { homeScopeMismatch } from "../src/homeScope.js";

describe("homeScope (daemon-client)", () => {
  it("returns null when env HOME matches account home", () => {
    expect(homeScopeMismatch("/same/home", "/same/home")).toBeNull();
  });

  it("returns mismatch when env HOME diverges", () => {
    expect(homeScopeMismatch("/tmp/fakehome", "/real/home")).toEqual({
      envHome: "/tmp/fakehome",
      accountHome: "/real/home",
    });
  });
});
