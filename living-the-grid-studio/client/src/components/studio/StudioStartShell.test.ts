import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudioStartShell } from "./StudioStartShell";

describe("StudioStartShell", () => {
  it("renders the useful 256 canvas start state while the editor loads", () => {
    const markup = renderToStaticMarkup(StudioStartShell());

    expect(markup).toContain('id="main-content"');
    expect(markup).toContain("What would you like to make?");
    expect(markup).toContain("256×256 game canvas");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
  });
});
