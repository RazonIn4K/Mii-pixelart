import assert from "node:assert/strict";

import { createGridDocumentFromAiSketch } from "../client/src/lib/engine/ai-sketch";
import type { AiGridSketch } from "../shared/ai";

const sketch: AiGridSketch = {
  name: "AI Smoke Icon",
  width: 8,
  height: 8,
  rows: [
    [null, null, "R10C1", "R10C1", "R10C1", "R10C1", null, null],
    [null, "R10C1", "R1C2", "R1C2", "R1C2", "R1C2", "R10C1", null],
    ["R10C1", "R1C2", "R10C7", "R1C2", "R1C2", "R10C7", "R1C2", "R10C1"],
    ["R10C1", "R1C2", "R1C2", "R10C1", "R10C1", "R1C2", "R1C2", "R10C1"],
    ["R10C1", "R1C2", "R1C2", "R1C2", "R1C2", "R1C2", "R1C2", "R10C1"],
    [null, "R10C1", "R1C2", "R10C7", "R10C7", "R1C2", "R10C1", null],
    [null, null, "R10C1", "R1C2", "R1C2", "R10C1", null, null],
    [null, null, null, "R10C1", "R10C1", null, null, null],
  ],
};

const doc = createGridDocumentFromAiSketch(sketch);
assert.equal(doc.meta.name, "AI Smoke Icon");
assert.equal(doc.meta.sourceFormat, "ai-openrouter-sketch");
assert.equal(doc.width, 8);
assert.equal(doc.height, 8);
assert.equal(doc.cells.length, 64);
assert.deepEqual(new Set(doc.usedColors), new Set(["R10C1", "R1C2", "R10C7"]));

assert.throws(
  () =>
    createGridDocumentFromAiSketch({
      ...sketch,
      rows: sketch.rows.map((row) => row.map(() => "NOT_A_COLOR")),
    }),
  /unknown palette color/,
);

console.log("AI sketch verification passed.");
