import assert from "node:assert/strict";

import {
  CROSS_LAYER_INTERACTIONS,
  DISTRICTS,
  ISLAND_FACILITY_PLANS,
  ISLAND_GROWTH_STAGES,
  RESIDENT_CREATION_STEPS,
  STARTER_RESIDENTS,
  evaluateQuestAnswer,
  validateStarterResidents,
} from "../client/src/lib/engine/residents";

const validationErrors = validateStarterResidents();
assert.deepEqual(validationErrors, []);

assert.equal(DISTRICTS.length, 9);
assert.ok(DISTRICTS.some((district) => district.id === "silicon-beach"));
assert.ok(DISTRICTS.some((district) => district.id === "boolean-boardwalk"));
assert.ok(DISTRICTS.some((district) => district.id === "circuit-plaza"));
assert.ok(DISTRICTS.some((district) => district.id === "architecture-atrium"));
assert.ok(DISTRICTS.some((district) => district.id === "assembly-avenue"));
assert.ok(DISTRICTS.some((district) => district.id === "vm-village"));
assert.ok(DISTRICTS.some((district) => district.id === "compiler-grove"));
assert.ok(DISTRICTS.some((district) => district.id === "oz-oasis"));
assert.ok(DISTRICTS.some((district) => district.id === "perlis-peak"));

assert.ok(STARTER_RESIDENTS.length >= 8);
for (const resident of STARTER_RESIDENTS) {
  assert.ok(resident.bridgeBelow.length > 0);
  assert.ok(resident.bridgeAbove.length > 0);
  assert.ok(resident.questHook.id.length > 0);
  assert.ok(resident.quirks?.length);
  assert.ok(resident.giftPlan?.length);
  assert.ok(resident.homePlan?.length);
  assert.ok(resident.relationshipPlan?.length);
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
assert.match(stateBridge.quest.expectedOutput, /software mutable state/);
assert.ok(
  evaluateQuestAnswer(
    "Hardware state makes memory with a clock, but mutable variables add time and nondeterminism.",
    stateBridge.quest,
  ),
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
    "It preserves behavior through VM, assembly, CPU, and ALU steps.",
    translation.quest,
  ),
);

console.log("Resident system verification passed.");
