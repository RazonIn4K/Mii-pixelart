export type QuestTrigger =
  | "residentChat"
  | "districtBridge"
  | "relationshipConflict"
  | "studySession";

export type QuestArtifactType =
  | "truthTable"
  | "circuit"
  | "assembly"
  | "vmTrace"
  | "program"
  | "stateTrace";

export type MiiPlatform = "SWITCH" | "THREE_DS";
export type MiiGender = "MALE" | "FEMALE" | "NONBINARY";
export type MiiMakeup = "NONE" | "PARTIAL" | "FULL";

export interface QuestHook {
  id: string;
  title: string;
  trigger: QuestTrigger;
  input: string;
  artifactType: QuestArtifactType;
  bridgeQuestion: string;
  expectedOutput: string;
  correctionHint: string;
  retryVariant: string;
  acceptanceKeywords?: string[];
}

export interface MiiResidentVisualFeatures {
  hair?: Record<string, unknown>;
  head?: Record<string, unknown>;
  eyebrows?: Record<string, unknown>;
  eyes?: Record<string, unknown>;
  nose?: Record<string, unknown>;
  lips?: Record<string, unknown>;
  glasses?: Record<string, unknown>;
  other?: Record<string, unknown>;
  height?: number;
  weight?: number;
}

export interface MiiResidentSpec {
  id: string;
  name: string;
  district: string;
  districtId: string;
  layerRole: string;
  tags: string[];
  sourceCredits: string[];
  platform: MiiPlatform;
  gender: MiiGender;
  makeup: MiiMakeup;
  bridgeBelow: string;
  bridgeAbove: string;
  questHook: QuestHook;
  visualFeatures: MiiResidentVisualFeatures;
  voice?: Record<string, unknown>;
  personality?: Record<string, unknown>;
  quirks?: string[];
  giftPlan?: string[];
  homePlan?: string;
  relationshipPlan?: string;
  catchphrase: string;
  recallPrompt: string;
  pixelArtNotes: string;
}

export interface ResidentValidationResult {
  errors: string[];
  spec: MiiResidentSpec | null;
  valid: boolean;
}

const QUEST_TRIGGERS: QuestTrigger[] = [
  "residentChat",
  "districtBridge",
  "relationshipConflict",
  "studySession",
];

const ARTIFACT_TYPES: QuestArtifactType[] = [
  "truthTable",
  "circuit",
  "assembly",
  "vmTrace",
  "program",
  "stateTrace",
];

const PLATFORMS: MiiPlatform[] = ["SWITCH", "THREE_DS"];
const GENDERS: MiiGender[] = ["MALE", "FEMALE", "NONBINARY"];
const MAKEUP_TIERS: MiiMakeup[] = ["NONE", "PARTIAL", "FULL"];

export function validateMiiResidentSpec(
  value: unknown,
): ResidentValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      errors: ["Resident spec must be a JSON object."],
      spec: null,
      valid: false,
    };
  }

  requireString(value, "id", errors);
  requireString(value, "name", errors);
  requireString(value, "district", errors);
  requireString(value, "districtId", errors);
  requireString(value, "layerRole", errors);
  requireStringArray(value, "tags", errors);
  requireStringArray(value, "sourceCredits", errors);
  requireEnum(value, "platform", PLATFORMS, errors);
  requireEnum(value, "gender", GENDERS, errors);
  requireEnum(value, "makeup", MAKEUP_TIERS, errors);
  requireString(value, "bridgeBelow", errors);
  requireString(value, "bridgeAbove", errors);
  requireString(value, "catchphrase", errors);
  requireString(value, "recallPrompt", errors);
  requireString(value, "pixelArtNotes", errors);

  if (!isRecord(value.visualFeatures)) {
    errors.push("visualFeatures must be an object.");
  } else {
    for (const numericKey of ["height", "weight"]) {
      const numericValue = value.visualFeatures[numericKey];
      if (
        numericValue !== undefined &&
        (typeof numericValue !== "number" || !Number.isFinite(numericValue))
      ) {
        errors.push(`visualFeatures.${numericKey} must be a finite number.`);
      }
    }
  }

  validateQuestHook(value.questHook, errors);

  if (value.voice !== undefined && !isRecord(value.voice)) {
    errors.push("voice must be an object when provided.");
  }
  if (value.personality !== undefined && !isRecord(value.personality)) {
    errors.push("personality must be an object when provided.");
  }
  if (value.quirks !== undefined && !isStringArray(value.quirks)) {
    errors.push("quirks must be an array of strings when provided.");
  }
  if (value.giftPlan !== undefined && !isStringArray(value.giftPlan)) {
    errors.push("giftPlan must be an array of strings when provided.");
  }
  if (value.homePlan !== undefined && typeof value.homePlan !== "string") {
    errors.push("homePlan must be a string when provided.");
  }
  if (
    value.relationshipPlan !== undefined &&
    typeof value.relationshipPlan !== "string"
  ) {
    errors.push("relationshipPlan must be a string when provided.");
  }

  return {
    errors,
    spec: errors.length === 0 ? (value as unknown as MiiResidentSpec) : null,
    valid: errors.length === 0,
  };
}

export function buildResidentDesignerPrompt(): string {
  return [
    "You are an expert Tomodachi Life: Living the Dream Mii feature designer, CS abstraction tutor, and repaintable pixel-art director.",
    "Create one strict JSON object matching the MiiResidentSpec interface.",
    "The resident must belong to the Layers of Abstraction island and must include bridgeBelow, bridgeAbove, and a structured questHook.",
    "Include quirks, giftPlan, homePlan, and relationshipPlan when they help make the resident feel like a Living the Dream islander.",
    "The quest must use the loop: present input, ask prediction, correct wrong answers using the layer below, then give a retry variant.",
    "Pixel art must encode the concept, not just decorate the face.",
    "Use sourceCredits for book/site references and include fan-made/unaffiliated wording when relevant.",
    "Do not return markdown. Return JSON only.",
  ].join(" ");
}

function validateQuestHook(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("questHook must be an object.");
    return;
  }

  requireString(value, "id", errors, "questHook");
  requireString(value, "title", errors, "questHook");
  requireEnum(value, "trigger", QUEST_TRIGGERS, errors, "questHook");
  requireString(value, "input", errors, "questHook");
  requireEnum(value, "artifactType", ARTIFACT_TYPES, errors, "questHook");
  requireString(value, "bridgeQuestion", errors, "questHook");
  requireString(value, "expectedOutput", errors, "questHook");
  requireString(value, "correctionHint", errors, "questHook");
  requireString(value, "retryVariant", errors, "questHook");
  if (
    value.acceptanceKeywords !== undefined &&
    !isStringArray(value.acceptanceKeywords)
  ) {
    errors.push("questHook.acceptanceKeywords must be an array of strings.");
  }
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  prefix?: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${prefix ? `${prefix}.` : ""}${key} must be a non-empty string.`);
  }
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
): void {
  if (!isStringArray(record[key])) {
    errors.push(`${key} must be an array of strings.`);
  }
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: T[],
  errors: string[],
  prefix?: string,
): void {
  if (!allowed.includes(record[key] as T)) {
    errors.push(
      `${prefix ? `${prefix}.` : ""}${key} must be one of ${allowed.join(", ")}.`,
    );
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
