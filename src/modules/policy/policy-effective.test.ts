import { describe, expect, it } from "vitest";
import { isEffectiveAt } from "./policy-effective.js";

describe("policy effective intervals", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const end = new Date("2027-01-01T00:00:00.000Z");

  it("uses an inclusive start boundary", () => {
    expect(isEffectiveAt(start, end, start)).toBe(true);
  });

  it("uses an exclusive end boundary", () => {
    expect(isEffectiveAt(start, end, end)).toBe(false);
  });
});
