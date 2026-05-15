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
  {
    context: "200,000 tokens",
    id: "~anthropic/claude-haiku-latest",
    label: "Claude Haiku Latest",
    note: "Fast critique and sketch drafts.",
    pricingCompletion: "$5.00/1M",
    pricingPrompt: "$1.00/1M",
    rank: 1,
    releaseDate: "2026-04-27",
  },
  {
    context: "400,000 tokens",
    id: "~openai/gpt-mini-latest",
    label: "GPT Mini Latest",
    note: "Balanced structured sketch generation.",
    pricingCompletion: "$4.50/1M",
    pricingPrompt: "$0.75/1M",
    rank: 2,
    releaseDate: "2026-04-27",
  },
  {
    context: "1,048,576 tokens",
    id: "~google/gemini-pro-latest",
    label: "Gemini Pro Latest",
    note: "Large-context art direction and planning.",
    pricingCompletion: "$12.00/1M",
    pricingPrompt: "$2.00/1M",
    rank: 3,
    releaseDate: "2026-04-27",
  },
  {
    context: "256,000 tokens",
    id: "~moonshotai/kimi-latest",
    label: "Kimi Latest",
    note: "Long-context alternative drafts.",
    pricingCompletion: "$4.66/1M",
    pricingPrompt: "$0.74/1M",
    rank: 4,
    releaseDate: "2026-04-27",
  },
  {
    context: "1,048,576 tokens",
    id: "~google/gemini-flash-latest",
    label: "Gemini Flash Latest",
    note: "Fast, cheaper sketch variations.",
    pricingCompletion: "$3.00/1M",
    pricingPrompt: "$0.50/1M",
    rank: 5,
    releaseDate: "2026-04-27",
  },
  {
    context: "1,000,000 tokens",
    id: "~anthropic/claude-sonnet-latest",
    label: "Claude Sonnet Latest",
    note: "Strong art critique and prompt following.",
    pricingCompletion: "$15.00/1M",
    pricingPrompt: "$3.00/1M",
    rank: 6,
    releaseDate: "2026-04-27",
  },
  {
    context: "1,050,000 tokens",
    id: "~openai/gpt-latest",
    label: "GPT Latest",
    note: "High-end structured pixel sketches.",
    pricingCompletion: "$30.00/1M",
    pricingPrompt: "$5.00/1M",
    rank: 7,
    releaseDate: "2026-04-27",
  },
  {
    context: "1,000,000 tokens",
    id: "qwen/qwen3.5-plus-20260420",
    label: "Qwen3.5 Plus",
    note: "Large-context value model.",
    pricingCompletion: "$2.40/1M",
    pricingPrompt: "$0.40/1M",
    rank: 8,
    releaseDate: "2026-04-26",
  },
  {
    context: "1,000,000 tokens",
    id: "qwen/qwen3.6-flash",
    label: "Qwen3.6 Flash",
    note: "Low-cost fast drafts.",
    pricingCompletion: "$1.50/1M",
    pricingPrompt: "$0.25/1M",
    rank: 9,
    releaseDate: "2026-04-26",
  },
  {
    context: "262,144 tokens",
    id: "qwen/qwen3.6-35b-a3b",
    label: "Qwen3.6 35B A3B",
    note: "Very low-cost structured attempts.",
    pricingCompletion: "$0.97/1M",
    pricingPrompt: "$0.16/1M",
    rank: 10,
    releaseDate: "2026-04-26",
  },
  {
    context: "262,144 tokens",
    id: "qwen/qwen3.6-max-preview",
    label: "Qwen3.6 Max Preview",
    note: "Stronger Qwen preview model.",
    pricingCompletion: "$7.80/1M",
    pricingPrompt: "$1.30/1M",
    rank: 11,
    releaseDate: "2026-04-26",
  },
  {
    context: "262,144 tokens",
    id: "qwen/qwen3.6-27b",
    label: "Qwen3.6 27B",
    note: "Mid-cost Qwen sketch model.",
    pricingCompletion: "$2.00/1M",
    pricingPrompt: "$0.50/1M",
    rank: 12,
    releaseDate: "2026-04-26",
  },
  {
    context: "1,050,000 tokens",
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    note: "High-end structured output.",
    pricingCompletion: "$30.00/1M",
    pricingPrompt: "$5.00/1M",
    rank: 13,
    releaseDate: "2026-04-24",
  },
  {
    context: "1,048,576 tokens",
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    note: "Large-context value reasoning.",
    pricingCompletion: "$0.87/1M",
    pricingPrompt: "$0.43/1M",
    rank: 14,
    releaseDate: "2026-04-23",
  },
  {
    context: "1,048,576 tokens",
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    note: "Very low-cost fast testing.",
    pricingCompletion: "$0.28/1M",
    pricingPrompt: "$0.14/1M",
    rank: 15,
    releaseDate: "2026-04-23",
  },
  {
    context: "262,144 tokens",
    id: "tencent/hy3-preview:free",
    label: "Hy3 Preview Free",
    note: "Free model for rough comparisons.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 16,
    releaseDate: "2026-04-22",
  },
  {
    context: "1,048,576 tokens",
    id: "xiaomi/mimo-v2.5-pro",
    label: "MiMo V2.5 Pro",
    note: "Alternative large-context model.",
    pricingCompletion: "$3.00/1M",
    pricingPrompt: "$1.00/1M",
    rank: 17,
    releaseDate: "2026-04-22",
  },
  {
    context: "1,048,576 tokens",
    id: "xiaomi/mimo-v2.5",
    label: "MiMo V2.5",
    note: "Lower-cost MiMo comparison.",
    pricingCompletion: "$2.00/1M",
    pricingPrompt: "$0.40/1M",
    rank: 18,
    releaseDate: "2026-04-22",
  },
  {
    context: "272,000 tokens",
    id: "openai/gpt-5.4-image-2",
    label: "GPT-5.4 Image 2",
    note: "Image-capable option; text sketch path still expects JSON.",
    pricingCompletion: "$15.00/1M",
    pricingPrompt: "$8.00/1M",
    rank: 19,
    releaseDate: "2026-04-21",
  },
  {
    context: "1,000,000 tokens",
    id: "~anthropic/claude-opus-latest",
    label: "Claude Opus Latest",
    note: "Premium art direction and critique.",
    pricingCompletion: "$25.00/1M",
    pricingPrompt: "$5.00/1M",
    rank: 20,
    releaseDate: "2026-04-21",
  },
  {
    context: "256,000 tokens",
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    note: "Kimi fixed-version comparison.",
    pricingCompletion: "$4.66/1M",
    pricingPrompt: "$0.74/1M",
    rank: 21,
    releaseDate: "2026-04-20",
  },
  {
    context: "1,000,000 tokens",
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    note: "Premium fixed-version comparison.",
    pricingCompletion: "$25.00/1M",
    pricingPrompt: "$5.00/1M",
    rank: 22,
    releaseDate: "2026-04-16",
  },
  {
    context: "202,752 tokens",
    id: "z-ai/glm-5.1",
    label: "GLM 5.1",
    note: "Alternative structured-output model.",
    pricingCompletion: "$3.50/1M",
    pricingPrompt: "$1.05/1M",
    rank: 23,
    releaseDate: "2026-04-07",
  },
  {
    context: "262,144 tokens",
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B Free",
    note: "Free rough sketch testing.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 24,
    releaseDate: "2026-04-03",
  },
  {
    context: "262,144 tokens",
    id: "google/gemma-4-26b-a4b-it",
    label: "Gemma 4 26B",
    note: "Low-cost Gemma comparison.",
    pricingCompletion: "$0.33/1M",
    pricingPrompt: "$0.06/1M",
    rank: 25,
    releaseDate: "2026-04-03",
  },
];
