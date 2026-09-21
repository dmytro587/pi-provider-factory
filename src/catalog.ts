import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import { Effort } from "@oh-my-pi/pi-catalog/effort";

import { CUSTOM_API } from "./constants";

export type FactoryModelFamily =
  | "anthropic"
  | "openai-responses"
  | "openai-completions"
  | "xai-responses"
  | "google-completions"
  | "unsupported";

export type FactoryModelInput = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ProviderModelConfig["input"];
  contextWindow: number;
  maxTokens: number;
};

export function grokThinking(id: string) {
  if (!id.startsWith("grok-")) {
    return undefined;
  }

  // First-party Grok 4.6 (and 4.20 multi-agent) expose Extra high (`xhigh`)
  // on the Responses `reasoning.effort` dial. Older Grok SKUs accept only
  // low/medium/high; Extra high is not a real wire tier there.
  if (id.startsWith("grok-4.6") || id.startsWith("grok-4.20-multi-agent")) {
    return { mode: "effort" as const, efforts: [Effort.Low, Effort.Medium, Effort.High, Effort.XHigh] };
  }

  return { mode: "effort" as const, efforts: [Effort.Low, Effort.Medium, Effort.High] };
}

export function grokReasoningEffortMap(id: string) {
  if (!id.startsWith("grok-")) {
    return undefined;
  }

  if (id.startsWith("grok-4.6") || id.startsWith("grok-4.20-multi-agent")) {
    return { [Effort.Minimal]: "low" };
  }

  return { [Effort.Minimal]: "low", [Effort.XHigh]: "high" };
}
// Upstream first-party USD per million tokens, sourced from omp 18.1.13's
// bundled pi-catalog models.json (provider anthropic/openai/xai/zai/moonshot/
// deepseek/google/nvidia/fireworks). Factory bills these list prices times
// its docs multiplier, so the catalog carries the scaled number and omp's
// calculateCost reports what Factory actually charges.
const UPSTREAM_USD_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-fable-5.1": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-5-fast": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8-fast": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-7-fast": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-6-fast": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-5-20251101": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "gpt-5.6-sol": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
  "gpt-5.6-sol-fast": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
  "gpt-5.6-terra": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
  "gpt-5.5": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
  "gpt-5.5-fast": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
  "gpt-5.5-pro": { input: 30, output: 180, cacheRead: 3, cacheWrite: 37.5 },
  "gpt-5.4": { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 3.125 },
  "gpt-5.4-fast": { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 3.125 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0.9375 },
  "gpt-5.4-mini-fast": { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0.9375 },
  "gpt-5.3-codex": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 2.1875 },
  "gpt-5.3-codex-fast": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 2.1875 },
  "gpt-5.2": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 2.1875 },
  "gemini-3.1-pro-preview": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0 },
  "gemini-3.5-flash": { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0 },
  "gemini-3-flash-preview": { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0 },
  "grok-4.6": { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
  "grok-4.5": { input: 2, output: 6, cacheRead: 0.3, cacheWrite: 0 },
  inkling: { input: 1.25, output: 5.0625, cacheRead: 0.2125, cacheWrite: 0 },
  "glm-5.3": { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  "glm-5.3-flash": { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  "glm-5.2": { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  "glm-5.2-fast": { input: 2.1, output: 6.6, cacheRead: 0.21, cacheWrite: 0 },
  "glm-5.1": { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  "kimi-k3": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
  "kimi-k2.7-code": { input: 0.95, output: 4, cacheRead: 0.19, cacheWrite: 0 },
  "kimi-k2.6": { input: 0.95, output: 4, cacheRead: 0.16, cacheWrite: 0 },
  "kimi-k2.5": { input: 0.6, output: 3, cacheRead: 0.1, cacheWrite: 0 },
  "deepseek-v4-pro": { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 },
  "deepseek-v4-flash-0731": { input: 0.175, output: 0.35, cacheRead: 0.035, cacheWrite: 0 },
  "minimax-m3": { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
  "minimax-m2.7": { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
  "minimax-m2.5": { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
  "nemotron-3-ultra": { input: 0.5, output: 2.5, cacheRead: 0.15, cacheWrite: 0 },
};

// Factory's per-model billing multipliers, from the public docs
// (docs.factory.ai/models.md, "Multiplier" column, fetched 2026-09-09).
const FACTORY_DOCS_MULTIPLIERS: Record<string, number> = {
  "claude-fable-5.1": 4,
  "claude-fable-5": 4,
  "claude-opus-5": 2,
  "claude-opus-5-fast": 4,
  "claude-opus-4-8": 2,
  "claude-opus-4-8-fast": 4,
  "claude-opus-4-7": 2,
  "claude-opus-4-6": 2,
  "claude-opus-4-5-20251101": 2,
  "claude-sonnet-5": 0.8,
  "claude-sonnet-4-6": 1.2,
  "claude-sonnet-4-5-20250929": 1.2,
  "claude-haiku-4-5-20251001": 0.4,
  "gpt-5.6-sol": 2,
  "gpt-5.6-sol-fast": 4,
  "gpt-5.6-terra": 0.8,
  "gpt-5.6-luna": 0.08,
  "gpt-5.5": 2,
  "gpt-5.5-fast": 5,
  "gpt-5.5-pro": 12,
  "gpt-5.4": 1,
  "gpt-5.4-fast": 2,
  "gpt-5.4-mini": 0.3,
  "gpt-5.4-mini-fast": 0.6,
  "gpt-5.3-codex": 0.7,
  "gpt-5.3-codex-fast": 1.4,
  "gpt-5.2": 0.7,
  "gemini-3.1-pro-preview": 0.8,
  "gemini-3.7-flash": 0.3,
  "gemini-3.6-flash": 0.6,
  "gemini-3.5-flash": 0.6,
  "gemini-3-flash-preview": 0.2,
  "grok-4.6": 0.8,
  "grok-4.5": 0.8,
  inkling: 0.4,
  "glm-5.3-flash": 0.06,
  "glm-5.3": 0.56,
  "glm-5.2": 0.56,
  "glm-5.2-fast": 0.84,
  "kimi-k3": 1.2,
  "kimi-k2.7-code": 0.38,
  "kimi-k2.6": 0.4,
  "nemotron-3-ultra": 0.24,
  "deepseek-v4-flash-0731": 0.176,
  "deepseek-v4-pro": 0.528,
  "minimax-m3": 0.12,
  "minimax-m2.7": 0.12,
  "kimi-k2.5": 0.25,
  "glm-5.1": 0.55,
};

export function modelCost(
  upstream: { input: number; output: number; cacheRead: number; cacheWrite: number },
  multiplier: number,
) {
  const scale = (value: number) => Number(value.toPrecision(6));

  return {
    input: scale(upstream.input * multiplier),
    output: scale(upstream.output * multiplier),
    cacheRead: scale(upstream.cacheRead * multiplier),
    cacheWrite: scale(upstream.cacheWrite * multiplier),
  };
}

export function factoryCostFor(id: string) {
  const upstream = UPSTREAM_USD_PER_MTOK[id];
  if (!upstream) {
    return undefined;
  }

  return modelCost(upstream, FACTORY_DOCS_MULTIPLIERS[id] ?? 1);
}

export function factoryModel(config: FactoryModelInput): ProviderModelConfig {
  const thinking = grokThinking(config.id);

  return {
    id: config.id,
    name: config.name,
    api: CUSTOM_API,
    reasoning: config.reasoning,
    input: config.input,
    cost: factoryCostFor(config.id) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
    ...(thinking ? { thinking } : {}),
  };
}

// Per-model context/max-output sizes, sourced from Droid 0.210.0's embedded
// model registry (contextLimits.maxInputTokens/maxOutputTokens). Kept as data
// instead of per-entry literals so the static catalog, the docs parser, and
// the feature-flags parser all resolve identical numbers for a given ID.
// `undefined` falls back to the family default in modelSize().
const MODEL_SIZES: Record<string, { contextWindow: number; maxTokens: number }> = {
  // Anthropic: Opus 5 / Fable 5.x share 867k input (UnT); Sonnet 5 is 872k (vau).
  "claude-opus-5": { contextWindow: 867000, maxTokens: 128000 },
  "claude-opus-5-fast": { contextWindow: 867000, maxTokens: 128000 },
  "claude-fable-5.1": { contextWindow: 867000, maxTokens: 128000 },
  "claude-fable-5": { contextWindow: 867000, maxTokens: 128000 },
  "claude-sonnet-5": { contextWindow: 872000, maxTokens: 128000 },
  // OpenAI Responses models moved to 1.05M input / 128k output (BlT).
  "gpt-5.5": { contextWindow: 1050000, maxTokens: 128000 },
  "gpt-5.5-fast": { contextWindow: 1050000, maxTokens: 128000 },
  "gpt-5.5-pro": { contextWindow: 1050000, maxTokens: 128000 },
  "gpt-5.6-sol": { contextWindow: 1050000, maxTokens: 128000 },
  "gpt-5.6-sol-fast": { contextWindow: 1050000, maxTokens: 128000 },
  "gpt-5.6-terra": { contextWindow: 1050000, maxTokens: 128000 },
  "gpt-5.6-luna": { contextWindow: 1050000, maxTokens: 128000 },
  // xAI: Grok 4.x = 200k input / 63,356 output.
  "grok-4.6": { contextWindow: 200000, maxTokens: 63356 },
  "grok-4.5": { contextWindow: 200000, maxTokens: 63356 },
  // Google: Gemini 3.x = 1M input / 65,536 output.
  "gemini-3.1-pro-preview": { contextWindow: 1000000, maxTokens: 65536 },
  "gemini-3.7-flash": { contextWindow: 1000000, maxTokens: 65536 },
  "gemini-3.6-flash": { contextWindow: 1000000, maxTokens: 65536 },
  "gemini-3.5-flash": { contextWindow: 1000000, maxTokens: 65536 },
  "gemini-3-flash-preview": { contextWindow: 1000000, maxTokens: 65536 },
  // Droid Core registry: kimi-k3 262k/64k, inkling 1.04M/32k,
  // deepseek-v4-flash-0731 1.04M/128k.
  "kimi-k3": { contextWindow: 262144, maxTokens: 65536 },
  inkling: { contextWindow: 1040000, maxTokens: 32768 },
  "deepseek-v4-flash-0731": { contextWindow: 1040000, maxTokens: 131072 },
  "glm-5.3-flash": { contextWindow: 1040000, maxTokens: 131072 },
  "glm-5.3": { contextWindow: 1040000, maxTokens: 131072 },
  "glm-5.2": { contextWindow: 1040000, maxTokens: 131072 },
  "glm-5.2-fast": { contextWindow: 1040000, maxTokens: 131072 },
};

const FAMILY_DEFAULTS: Record<
  Exclude<FactoryModelFamily, "unsupported">,
  { contextWindow: number; maxTokens: number; input: ProviderModelConfig["input"] }
> = {
  anthropic: { contextWindow: 200000, maxTokens: 64000, input: ["text", "image"] },
  "openai-responses": { contextWindow: 400000, maxTokens: 128000, input: ["text", "image"] },
  "openai-completions": { contextWindow: 200000, maxTokens: 32000, input: ["text"] },
  "xai-responses": { contextWindow: 200000, maxTokens: 63356, input: ["text", "image"] },
  "google-completions": { contextWindow: 1000000, maxTokens: 65536, input: ["text", "image"] },
};

export function modelSize(id: string): { contextWindow: number; maxTokens: number; input: ProviderModelConfig["input"] } {
  const family = familyOf(id);
  if (family === "unsupported") {
    return FAMILY_DEFAULTS["openai-completions"];
  }

  return { ...FAMILY_DEFAULTS[family], ...MODEL_SIZES[id] };
}

export const FACTORY_MODELS: ProviderModelConfig[] = [
  // Anthropic gateway
  factoryModel({ id: "claude-opus-5", name: "Claude Opus 5 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 867000, maxTokens: 128000 }),
  factoryModel({ id: "claude-opus-5-fast", name: "Claude Opus 5 Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 867000, maxTokens: 128000 }),
  factoryModel({ id: "claude-fable-5.1", name: "Claude Fable 5.1 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 867000, maxTokens: 128000 }),
  factoryModel({ id: "claude-opus-4-8", name: "Claude Opus 4.8 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-opus-4-8-fast", name: "Claude Opus 4.8 Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-opus-4-7", name: "Claude Opus 4.7 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-opus-4-7-fast", name: "Claude Opus 4.7 Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-opus-4-6", name: "Claude Opus 4.6 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-opus-4-6-fast", name: "Claude Opus 4.6 Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-sonnet-5", name: "Claude Sonnet 5 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 872000, maxTokens: 128000 }),
  factoryModel({ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-fable-5", name: "Claude Fable 5 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 867000, maxTokens: 128000 }),
  factoryModel({ id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }),
  factoryModel({ id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5 (Factory)", reasoning: false, input: ["text", "image"], contextWindow: 200000, maxTokens: 32000 }),
  // OpenAI Responses gateway
  factoryModel({ id: "gpt-5.6-sol", name: "GPT-5.6 Sol (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1050000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.6-sol-fast", name: "GPT-5.6 Sol Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1050000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.6-terra", name: "GPT-5.6 Terra (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1050000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.6-luna", name: "GPT-5.6 Luna (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1050000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.5", name: "GPT-5.5 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1050000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.5-fast", name: "GPT-5.5 Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1050000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.5-pro", name: "GPT-5.5 Pro (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1050000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.4", name: "GPT-5.4 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.4-fast", name: "GPT-5.4 Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.4-mini", name: "GPT-5.4 Mini (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.4-mini-fast", name: "GPT-5.4 Mini Fast (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.3-codex", name: "GPT-5.3 Codex (Factory)", reasoning: true, input: ["text"], contextWindow: 400000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.3-codex-fast", name: "GPT-5.3 Codex Fast (Factory)", reasoning: true, input: ["text"], contextWindow: 400000, maxTokens: 128000 }),
  factoryModel({ id: "gpt-5.2", name: "GPT-5.2 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxTokens: 128000 }),
  // xAI gateway (OpenAI Responses wire)
  factoryModel({ id: "grok-4.6", name: "Grok 4.6 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 63356 }),
  factoryModel({ id: "grok-4.5", name: "Grok 4.5 (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 63356 }),
  // Google gateway (OpenAI chat-completions wire)
  factoryModel({ id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 65536 }),
  factoryModel({ id: "gemini-3.7-flash", name: "Gemini 3.7 Flash (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 65536 }),
  factoryModel({ id: "gemini-3.6-flash", name: "Gemini 3.6 Flash (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 65536 }),
  factoryModel({ id: "gemini-3.5-flash", name: "Gemini 3.5 Flash (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 65536 }),
  factoryModel({ id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Factory)", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 65536 }),
  // Droid Core gateway (OpenAI chat-completions wire)
  factoryModel({ id: "glm-5.3-flash", name: "GLM 5.3 Flash (Factory Core)", reasoning: true, input: ["text"], contextWindow: 1040000, maxTokens: 131072 }),
  factoryModel({ id: "glm-5.3", name: "GLM 5.3 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 1040000, maxTokens: 131072 }),
  factoryModel({ id: "glm-5.2", name: "GLM 5.2 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 1040000, maxTokens: 131072 }),
  factoryModel({ id: "glm-5.2-fast", name: "GLM 5.2 Fast (Factory Core)", reasoning: true, input: ["text"], contextWindow: 1040000, maxTokens: 131072 }),
  factoryModel({ id: "glm-5.1", name: "GLM 5.1 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 190000, maxTokens: 131072 }),
  factoryModel({ id: "kimi-k3", name: "Kimi K3 (Factory Core)", reasoning: true, input: ["text", "image"], contextWindow: 262144, maxTokens: 65536 }),
  factoryModel({ id: "kimi-k2.7-code", name: "Kimi K2.7 Code (Factory Core)", reasoning: true, input: ["text", "image"], contextWindow: 262144, maxTokens: 65536 }),
  factoryModel({ id: "kimi-k2.6", name: "Kimi K2.6 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 262144, maxTokens: 65536 }),
  factoryModel({ id: "kimi-k2.5", name: "Kimi K2.5 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 256000, maxTokens: 32768 }),
  factoryModel({ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro (Factory Core)", reasoning: true, input: ["text"], contextWindow: 1048576, maxTokens: 65536 }),
  factoryModel({ id: "deepseek-v4-flash-0731", name: "DeepSeek V4 Flash 0731 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 1040000, maxTokens: 131072 }),
  factoryModel({ id: "inkling", name: "Inkling (Factory Core)", reasoning: true, input: ["text", "image"], contextWindow: 1040000, maxTokens: 32768 }),
  factoryModel({ id: "minimax-m3", name: "MiniMax M3 (Factory Core)", reasoning: true, input: ["text", "image"], contextWindow: 512000, maxTokens: 64000 }),
  factoryModel({ id: "minimax-m2.7", name: "MiniMax M2.7 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 196600, maxTokens: 64000 }),
  factoryModel({ id: "minimax-m2.5", name: "MiniMax M2.5 (Factory Core)", reasoning: true, input: ["text"], contextWindow: 204800, maxTokens: 64000 }),
  factoryModel({ id: "nemotron-3-ultra", name: "Nemotron 3 Ultra (Factory Core)", reasoning: true, input: ["text"], contextWindow: 262144, maxTokens: 65536 }),
];

export function familyOf(id: string): FactoryModelFamily {
  if (id.startsWith("claude-")) {
    return "anthropic";
  }

  if (id.startsWith("gpt-") || id.endsWith("-codex")) {
    return "openai-responses";
  }

  if (id.startsWith("grok-")) {
    return "xai-responses";
  }

  if (id.startsWith("gemini-")) {
    return "google-completions";
  }

  if (
    id.startsWith("glm-") ||
    id.startsWith("kimi-") ||
    id.startsWith("deepseek-") ||
    id.startsWith("minimax-") ||
    id.startsWith("nemotron-") ||
    id === "inkling"
  ) {
    return "openai-completions";
  }

  return "unsupported";
}

export type FactoryUpstreamProvider = "anthropic" | "openai" | "google" | "xai" | "fireworks";

// Factory's `x-api-provider` request header names the UPSTREAM the gateway routes
// to, independent of the wire API shape. Droid 0.210.0's gateway map:
// anthropic/vertex/bedrock → messages route; openai/azure → responses route;
// xai → responses route; google → chat-completions (and a Gemini-native
// /api/llm/g route Droid uses for its own client); fireworks/baseten →
// chat-completions. MiniMax resolves to "fireworks" even though Factory serves
// it through the Anthropic-compatible API.
export function upstreamProviderFor(id: string): FactoryUpstreamProvider {
  if (id.startsWith("claude-")) {
    return "anthropic";
  }

  if (id.startsWith("grok-")) {
    return "xai";
  }

  if (id.startsWith("gemini-")) {
    return "google";
  }

  if (id.startsWith("gpt-") || id.endsWith("-codex")) {
    return "openai";
  }

  return "fireworks";
}
