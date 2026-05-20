import assert from "node:assert/strict";

import {
  CROSS_LAYER_INTERACTIONS,
  DISTRICTS,
  ISLAND_FACILITY_PLANS,
  ISLAND_GROWTH_STAGES,
  RESIDENT_CREATION_STEPS,
  STARTER_RESIDENTS,
  buildResidentDesignerPrompt,
  evaluateQuestAnswer,
  validateMiiResidentSpec,
  validateStarterResidents,
  type MiiResidentSpec,
} from "../shared/residents";

const validationErrors = validateStarterResidents();
assert.deepEqual(validationErrors, []);

assert.equal(DISTRICTS.length, 9);
assert.deepEqual(
  DISTRICTS.map((district) => district.id),
  [
    "silicon-beach",
    "boolean-boardwalk",
    "circuit-plaza",
    "architecture-atrium",
    "assembly-avenue",
    "vm-village",
    "compiler-grove",
    "oz-oasis",
    "perlis-peak",
  ],
);

assert.ok(STARTER_RESIDENTS.length >= 8);
for (const resident of STARTER_RESIDENTS) {
  assert.ok(resident.bridgeBelow.length > 0, `${resident.id} bridgeBelow`);
  assert.ok(resident.bridgeAbove.length > 0, `${resident.id} bridgeAbove`);
  assert.ok(resident.questHook.id.length > 0, `${resident.id} questHook`);
  assert.ok(resident.quirks?.length, `${resident.id} quirks`);
  assert.ok(resident.giftPlan?.length, `${resident.id} giftPlan`);
  assert.ok(resident.homePlan?.length, `${resident.id} homePlan`);
  assert.ok(
    resident.relationshipPlan?.length,
    `${resident.id} relationshipPlan`,
  );
  assert.match(
    resident.sourceCredits.join(" "),
    /Fan-made|Unaffiliated/i,
    `${resident.id} source credits`,
  );
}

assert.equal(ISLAND_GROWTH_STAGES.length, 5);
assert.deepEqual(
  ISLAND_GROWTH_STAGES.map((stage) => stage.id),
  [
    "welcome-edition",
    "first-neighborhood",
    "machine-town",
    "translation-district",
    "model-oasis",
  ],
);
assert.ok(ISLAND_FACILITY_PLANS.length >= 6);
assert.ok(
  ISLAND_FACILITY_PLANS.some((facility) => facility.id === "palette-house"),
);
assert.equal(RESIDENT_CREATION_STEPS.length, 6);

const stateBridge = CROSS_LAYER_INTERACTIONS.find(
  (interaction) => interaction.id === "state-changes-meaning",
);
assert.ok(stateBridge);
assert.match(stateBridge.quest.expectedOutput, /Hardware state/);
assert.match(stateBridge.quest.expectedOutput, /software mutable state/i);
assert.ok(
  evaluateQuestAnswer(
    "Hardware state makes memory with a clock, but software mutable state adds time.",
    stateBridge.quest,
  ),
);
assert.equal(
  evaluateQuestAnswer("Variables are convenient.", stateBridge.quest),
  false,
);

const translation = CROSS_LAYER_INTERACTIONS.find(
  (interaction) => interaction.id === "translation-pipeline",
);
assert.ok(translation);
assert.match(translation.quest.expectedOutput, /VM commands/);
assert.match(translation.quest.expectedOutput, /assembly/);
assert.match(translation.quest.expectedOutput, /CPU/);
assert.ok(
  evaluateQuestAnswer(
    "The same behavior is preserved through VM commands, assembly, and CPU execution.",
    translation.quest,
  ),
);

const sampleResident: MiiResidentSpec = {
  ...STARTER_RESIDENTS[0],
  id: "schema-validation-copy",
};
const valid = validateMiiResidentSpec(sampleResident);
assert.equal(valid.valid, true);
assert.equal(valid.errors.length, 0);

const missingQuest = validateMiiResidentSpec({
  ...sampleResident,
  questHook: undefined,
});
assert.equal(missingQuest.valid, false);
assert.ok(missingQuest.errors.some((error) => error.includes("questHook")));

const badPlatform = validateMiiResidentSpec({
  ...sampleResident,
  platform: "GAMECUBE",
});
assert.equal(badPlatform.valid, false);
assert.ok(badPlatform.errors.some((error) => error.includes("platform")));

const badGrowthFields = validateMiiResidentSpec({
  ...sampleResident,
  quirks: "not-an-array",
});
assert.equal(badGrowthFields.valid, false);
assert.ok(badGrowthFields.errors.some((error) => error.includes("quirks")));

const prompt = buildResidentDesignerPrompt();
assert.match(prompt, /MiiResidentSpec/);
assert.match(prompt, /giftPlan/);
assert.match(prompt, /JSON only/);

console.log("Resident system verification passed.");
