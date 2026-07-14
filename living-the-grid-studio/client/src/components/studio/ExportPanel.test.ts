import { describe, expect, it } from "vitest";

import type { GridDocument } from "@/lib/engine/grid";
import { buildReferenceHtml, getSafeProjectName } from "./ExportPanel";

function hostileDocument(): GridDocument {
  return {
    version: 1,
    meta: {
      name: '<img src=x onerror=alert(1)>&"\'</title>',
      createdAt: "2026-07-12T00:00:00.000Z",
      modifiedAt: "2026-07-12T00:00:00.000Z",
    },
    width: 8,
    height: 8,
    cells: ["R1C1", ...new Array(63).fill(null)],
    usedColors: ["R1C1"],
    lockedColors: [],
  };
}

describe("reference pack export safety", () => {
  it("escapes hostile project names in every HTML context", () => {
    const doc = hostileDocument();
    const html = buildReferenceHtml(doc, JSON.stringify(doc));

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("</title></title>");
    expect(html).not.toContain("https://fonts.");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&amp;&quot;&#39;&lt;/title&gt;");
  });

  it("limits generated filenames to portable characters", () => {
    expect(getSafeProjectName(hostileDocument())).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
