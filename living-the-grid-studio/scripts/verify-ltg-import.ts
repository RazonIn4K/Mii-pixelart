import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { GridDocument } from "../client/src/lib/engine/grid";
import {
  exportGridJson,
  importGridJson,
  importLtgNative,
} from "../client/src/lib/engine/json-io";
import { TOMODACHI_PALETTE } from "../client/src/lib/engine/palette";

const paletteIds = new Set(TOMODACHI_PALETTE.map((color) => color.id));

function readJson(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function assertValidGridDocument(doc: GridDocument, expectedCells: number): void {
  assert.equal(doc.cells.length, expectedCells, "cell count should match dimensions");

  const uniqueCellIds = new Set<string>();
  for (const cell of doc.cells) {
    if (cell === null) continue;
    assert.ok(!cell.startsWith("#"), `cell should be a palette ID, got ${cell}`);
    assert.ok(paletteIds.has(cell), `cell should reference a known palette ID: ${cell}`);
    uniqueCellIds.add(cell);
  }

  assert.deepEqual(
    new Set(doc.usedColors),
    uniqueCellIds,
    "usedColors should match non-empty cell IDs"
  );
}

function assertNativeRoundTrip(doc: GridDocument): void {
  const roundTrip = importGridJson(exportGridJson(doc));
  assert.equal(roundTrip.width, doc.width, "round-trip width should survive");
  assert.equal(roundTrip.height, doc.height, "round-trip height should survive");
  assert.deepEqual(roundTrip.cells, doc.cells, "round-trip cells should survive");
  assert.deepEqual(
    new Set(roundTrip.usedColors),
    new Set(doc.usedColors),
    "round-trip used colors should survive"
  );
  assert.deepEqual(
    roundTrip.meta.sourcePaletteMappings,
    doc.meta.sourcePaletteMappings,
    "round-trip source palette mappings should survive"
  );
}

function verifyRealFixture(): void {
  const json = readJson("../fixtures/living-the-grid-real.json");
  const source = JSON.parse(json);
  const doc = importLtgNative(json);

  assert.equal(source.source, "living-the-grid.com");
  assert.equal(source.version, 2);
  assert.equal(doc.width, 64);
  assert.equal(doc.height, 64);
  assertValidGridDocument(doc, 64 * 64);
  assert.equal(doc.meta.sourceFormat, "living-the-grid:indexed-palette");
  assert.equal(doc.meta.sourceMetadata?.source, "living-the-grid.com");
  assert.equal(doc.meta.sourceMetadata?.version, 2);
  assert.equal(doc.meta.sourcePaletteMappings?.length, source.palette.length);
  assert.ok(
    doc.meta.sourcePaletteMappings?.every((mapping) => mapping.sourceRgb),
    "real fixture mappings should preserve source RGB tuples"
  );
  assert.ok(
    doc.meta.sourcePaletteMappings?.every((mapping) => mapping.sourcePress),
    "real fixture mappings should preserve source H/S/B press counts"
  );
  assert.ok((doc.meta.importWarnings?.length ?? 0) > 0);
  assertNativeRoundTrip(doc);
}

function verifySyntheticFixture(): void {
  const doc = importLtgNative(readJson("../fixtures/ltg-indexed-palette-sample.json"));
  assert.equal(doc.width, 4);
  assert.equal(doc.height, 4);
  assertValidGridDocument(doc, 16);
  assert.equal(doc.meta.sourcePaletteMappings?.length, 3);
  assertNativeRoundTrip(doc);
}

function verifySupportedVariants(): void {
  const flatGridJson = JSON.stringify({
    width: 2,
    height: 2,
    palette: ["#000000", { color: "#FFFFFF" }],
    pixels: [0, 1, -1, null],
  });
  const flatDoc = importLtgNative(flatGridJson);
  assert.deepEqual(flatDoc.cells, ["R10C1", "R10C7", null, null]);

  const gridAliasJson = JSON.stringify({
    width: 2,
    height: 2,
    palette: [{ hex: "#000000" }, { hex: "#FFFFFF" }],
    grid: [
      [0, 1],
      [1, 0],
    ],
  });
  const gridAliasDoc = importLtgNative(gridAliasJson);
  assert.deepEqual(gridAliasDoc.cells, ["R10C1", "R10C7", "R10C7", "R10C1"]);
}

function verifyInvalidInputFails(): void {
  assert.throws(
    () =>
      importLtgNative(
        JSON.stringify({
          width: 2,
          height: 2,
          palette: ["#000000"],
          pixels: [[0], [0, 0]],
        })
      ),
    /row 0 must contain 2 cells/
  );

  assert.throws(
    () =>
      importLtgNative(
        JSON.stringify({
          width: 1,
          height: 1,
          palette: ["not-a-color"],
          pixels: [[0]],
        })
      ),
    /palette entry 0/
  );
}

verifyRealFixture();
verifySyntheticFixture();
verifySupportedVariants();
verifyInvalidInputFails();

console.log("LTG import verification passed.");
