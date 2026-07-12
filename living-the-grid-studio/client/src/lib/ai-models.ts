import { OPENROUTER_MODEL_PRESETS } from "../../../shared/ai";

export const DEFAULT_OPENROUTER_MODEL_ID = OPENROUTER_MODEL_PRESETS[0].id;

export function normalizeOpenRouterModelChoice(value: unknown): string {
  return typeof value === "string" &&
    OPENROUTER_MODEL_PRESETS.some((preset) => preset.id === value)
    ? value
    : DEFAULT_OPENROUTER_MODEL_ID;
}
