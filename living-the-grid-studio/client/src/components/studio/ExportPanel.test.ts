import { describe, expect, it } from "vitest";

import type { GridDocument } from "@/lib/engine/grid";
import {
  buildReferenceHtml,
  getExportCellSize,
  getExportFailureMessage,
  getSafeProjectName,
} from "./ExportPanel";

function hostileDocument(): GridDocument {
  return {
    version: 1,
    meta: {
      name: "<img src=x onerror=alert(1)>&\"'</title>",
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
  it("bounds canonical exports while retaining readable labeled cells", () => {
    expect(getExportCellSize({ width: 256, height: 256 }, true)).toBe(12);
    expect(getExportCellSize({ width: 256, height: 256 }, false)).toBe(8);
    expect(getExportCellSize({ width: 64, height: 64 }, true)).toBe(16);
    expect(getExportCellSize({ width: 64, height: 64 }, false)).toBe(16);
  });

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

  it("uses actionable, non-sensitive messages for client export failures", () => {
    expect(getExportFailureMessage("pack")).toContain("individual JSON or PNG");
    expect(getExportFailureMessage("image")).toContain("desktop browser");
    expect(getExportFailureMessage("json")).toContain("download permissions");
    expect(getExportFailureMessage("pack")).not.toContain("Error:");
  });
});
