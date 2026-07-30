import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CREATIVE_TEMPLATES,
  createCreativeTemplateDocument,
  createCreativeTemplateFixtureDocument,
} from "../client/src/lib/engine/templates";
import { exportGridJson } from "../client/src/lib/engine/json-io";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "../fixtures/creative-templates");

mkdirSync(outputDir, { recursive: true });

const index = CREATIVE_TEMPLATES.map((template) => {
  const doc = createCreativeTemplateDocument(template.id);
  const fixtureDoc = createCreativeTemplateFixtureDocument(template.id);
  const filename = `${template.id}.json`;
  writeFileSync(
    path.join(outputDir, filename),
    `${exportGridJson(fixtureDoc)}\n`,
  );

  return {
    id: template.id,
    name: template.displayName,
    category: template.category,
    description: template.description,
    width: template.width,
    height: template.height,
    fixtureWidth: fixtureDoc.width,
    fixtureHeight: fixtureDoc.height,
    filename,
    colors: doc.usedColors.length,
  };
});

writeFileSync(
  path.join(outputDir, "index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
);

console.log(
  `Saved ${index.length} creative template fixture${index.length === 1 ? "" : "s"} to ${outputDir}`,
);
