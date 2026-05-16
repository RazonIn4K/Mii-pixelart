export type AiChatRole = "user" | "assistant";

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiDocumentSummary {
  name: string;
  width: number;
  height: number;
  usedColors: string[];
}

export interface AiGridImage {
  dataUrl: string;
  height: number;
  width: number;
}

export interface AiGridSketch {
  name: string;
  width: number;
  height: number;
  rows: (string | null)[][];
  notes?: string;
}

export interface AiChatRequest {
  currentDocument?: AiDocumentSummary | null;
  currentGridImage?: AiGridImage | null;
  messages: AiChatMessage[];
  model: string;
  requestSketch?: boolean;
  sessionId?: string;
}

export interface AiChatResponse {
  configured: boolean;
  model?: string;
  reply: string;
  sketch?: AiGridSketch | null;
  usage?: {
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
  };
  warning?: string;
}

export interface AiModelPreset {
  context: string;
  id: string;
  label: string;
  note: string;
  pricingCompletion: string;
  pricingPrompt: string;
  rank: number;
  releaseDate: string;
}

export const OPENROUTER_MODEL_PRESETS: AiModelPreset[] = [
  // FREE-ONLY curated list. The OpenRouter free tier rate-limits these
  // (typically 20 requests/minute per IP, 200/day per account), but they cost
  // the user nothing. Listed best-balance-first; users can override by typing
  // any other OpenRouter model ID into the picker.
  {
    context: "1,000,000 tokens",
    id: "google/gemini-2.0-flash-exp:free",
    label: "Gemini 2.0 Flash (free)",
    note: "Fast, large context, strong at structured JSON. Default pick.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 1,
    releaseDate: "2025-12-11",
  },
  {
    context: "128,000 tokens",
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (free)",
    note: "Capable open-weight model. Good instruction following on sketch prompts.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 2,
    releaseDate: "2024-12-06",
  },
  {
    context: "32,000 tokens",
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    label: "Qwen 2.5 Coder 32B (free)",
    note: "Coder model, particularly strong at JSON / structured output.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 3,
    releaseDate: "2024-11-12",
  },
  {
    context: "131,072 tokens",
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    label: "Hermes 3 405B (free)",
    note: "Largest free option. Slower but more creative.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 4,
    releaseDate: "2024-08-15",
  },
  {
    context: "8,192 tokens",
    id: "google/gemma-2-9b-it:free",
    label: "Gemma 2 9B (free)",
    note: "Small, fast fallback if the bigger models are rate-limited.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 5,
    releaseDate: "2024-06-27",
  },
];
