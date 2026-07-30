import { describe, expect, it } from "vitest";
import { formatCountLabel } from "./format-count";

describe("formatCountLabel", () => {
  it("uses the singular label only for exactly one", () => {
    expect(formatCountLabel(0, "color")).toBe("0 colors");
    expect(formatCountLabel(1, "color")).toBe("1 color");
    expect(formatCountLabel(2, "color")).toBe("2 colors");
  });

  it("formats large counts and supports irregular plurals", () => {
    expect(formatCountLabel(1_234, "cell")).toBe("1,234 cells");
    expect(formatCountLabel(2, "entry", "entries")).toBe("2 entries");
  });
});
