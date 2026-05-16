import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CREATIVE_TEMPLATES,
  createCreativeTemplateDocument,
} from "../client/src/lib/engine/templates";
import { resampleGridNearest } from "../client/src/lib/engine/grid";
import { importGridJson } from "../client/src/lib/engine/json-io";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(scriptDir, "../fixtures/creative-templates");

for (const template of CREATIVE_TEMPLATES) {
  const doc = createCreativeTemplateDocument(template.id);
  const cellColorIds = new Set(doc.cells.filter((id) => id !== null));
  const fixturePath = path.join(fixtureDir, `${template.id}.json`);

  assert.equal(doc.width, template.width, `${template.name} width`);
  assert.equal(doc.height, template.height, `${template.name} height`);
  assert.equal(
    doc.cells.length,
    template.width * template.height,
    `${template.name} cell count`,
  );
  assert.equal(
    doc.meta.sourceFormat,
    "creative-template",
    `${template.name} source format`,
  );
  assert.equal(
    doc.meta.sourceMetadata?.templateId,
    template.id,
    `${template.name} metadata template id`,
  );
  assert.equal(
    doc.meta.sourceMetadata?.templateCategory,
    template.category,
    `${template.name} metadata template category`,
  );
  assert.ok(
    doc.usedColors.length >= 3,
    `${template.name} should contain multiple paint colors`,
  );
  assert.deepEqual(
    new Set(doc.usedColors),
    cellColorIds,
    `${template.name} usedColors should match cells`,
  );

  assert.equal(
    existsSync(fixturePath),
    true,
    `${template.name} saved fixture should exist`,
  );

  const fixtureDoc = importGridJson(readFileSync(fixturePath, "utf8"));
  assert.equal(fixtureDoc.width, doc.width, `${template.name} fixture width`);
  assert.equal(
    fixtureDoc.height,
    doc.height,
    `${template.name} fixture height`,
  );
  assert.deepEqual(
    fixtureDoc.cells,
    doc.cells,
    `${template.name} fixture cells`,
  );

  const resizedDoc = resampleGridNearest(doc, doc.width * 2, doc.height * 2);
  assert.equal(
    resizedDoc.width,
    doc.width * 2,
    `${template.name} resampled width`,
  );
  assert.equal(
    resizedDoc.height,
    doc.height * 2,
    `${template.name} resampled height`,
  );
  assert.deepEqual(
    new Set(resizedDoc.usedColors),
    new Set(doc.usedColors),
    `${template.name} resampling should preserve palette IDs`,
  );
}

const indexPath = path.join(fixtureDir, "index.json");
assert.equal(
  existsSync(indexPath),
  true,
  "template fixture index should exist",
);
const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
  category: string;
  id: string;
}[];
assert.deepEqual(
  index.map((entry) => entry.id).sort(),
  CREATIVE_TEMPLATES.map((template) => template.id).sort(),
  "template fixture index should list all templates",
);
assert.deepEqual(
  index.map((entry) => entry.category).sort(),
  CREATIVE_TEMPLATES.map((template) => template.category).sort(),
  "template fixture index should preserve categories",
);

console.log("Creative template verification passed.");
