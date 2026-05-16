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
  // FREE-ONLY curated list, verified against OpenRouter on 2026-05-16.
  // The free tier rate-limits these (≈20 req/min per IP, 200/day per account)
  // but the user pays nothing. Listed best-balance-first; users can override
  // by typing any other OpenRouter model ID into the picker.
  //
  // We intentionally keep this short because OpenRouter's free-tier roster
  // rotates — every entry here was smoke-tested live before commit.
  {
    context: "1,000,000 tokens",
    id: "deepseek/deepseek-v4-flash:free",
    label: "DeepSeek V4 Flash (free)",
    note: "Fast, 1M context, strong structured output. Default pick.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 1,
    releaseDate: "2026-04-12",
  },
  {
    context: "131,072 tokens",
    id: "openai/gpt-oss-120b:free",
    label: "GPT OSS 120B (free)",
    note: "OpenAI-style 120B open model. Good at JSON / sketch grids.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 2,
    releaseDate: "2025-12-15",
  },
  {
    context: "131,072 tokens",
    id: "z-ai/glm-4.5-air:free",
    label: "GLM 4.5 Air (free)",
    note: "Alternative architecture, useful for second-opinion drafts.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 3,
    releaseDate: "2025-09-20",
  },
  {
    context: "1,000,000 tokens",
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B (free)",
    note: "Large NVIDIA model. Slower but more thorough on art critique.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 4,
    releaseDate: "2025-11-08",
  },
];
