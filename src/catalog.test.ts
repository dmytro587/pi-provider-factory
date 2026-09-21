import { describe, expect, test } from "bun:test";
import { FACTORY_MODELS, factoryCostFor, familyOf, grokReasoningEffortMap, grokThinking, modelSize, upstreamProviderFor } from "./catalog";

describe("familyOf", () => {
 test("routes every supported model family", () => {
  expect(familyOf("claude-opus-5")).toBe("anthropic");
  expect(familyOf("gpt-5.6-sol")).toBe("openai-responses");
  expect(familyOf("grok-4.6")).toBe("xai-responses");
  expect(familyOf("gemini-3.7-flash")).toBe("google-completions");
  expect(familyOf("glm-5.3")).toBe("openai-completions");
  expect(familyOf("kimi-k3")).toBe("openai-completions");
  expect(familyOf("inkling")).toBe("openai-completions");
  expect(familyOf("some-future-model")).toBe("unsupported");
 });
});

describe("upstreamProviderFor", () => {
 test("matches the droid 0.210.0 gateway upstream map", () => {
  expect(upstreamProviderFor("claude-opus-5")).toBe("anthropic");
  expect(upstreamProviderFor("gpt-5.5")).toBe("openai");
  expect(upstreamProviderFor("grok-4.6")).toBe("xai");
  expect(upstreamProviderFor("gemini-3.7-flash")).toBe("google");
  expect(upstreamProviderFor("glm-5.3")).toBe("fireworks");
  expect(upstreamProviderFor("minimax-m3")).toBe("fireworks");
  expect(upstreamProviderFor("inkling")).toBe("fireworks");
 });
});

describe("modelSize", () => {
 test("per-model table wins over family defaults", () => {
  expect(modelSize("grok-4.6")).toMatchObject({ contextWindow: 200000, maxTokens: 63356 });
  expect(modelSize("claude-sonnet-5")).toMatchObject({ contextWindow: 872000, maxTokens: 128000 });
  expect(modelSize("gpt-5.5")).toMatchObject({ contextWindow: 1050000, maxTokens: 128000 });
  expect(modelSize("inkling")).toMatchObject({ contextWindow: 1040000, maxTokens: 32768 });
 });

 test("unknown ids fall back to family defaults", () => {
  expect(modelSize("grok-5.0")).toMatchObject({ contextWindow: 200000, maxTokens: 63356 });
  expect(modelSize("gemini-4-flash")).toMatchObject({ contextWindow: 1000000, maxTokens: 65536 });
  expect(modelSize("glm-6")).toMatchObject({ contextWindow: 200000, maxTokens: 32000 });
 });
 test("scales upstream prices by the Factory docs multiplier", () => {
  // grok-4.6: upstream $2/$6, multiplier 0.8.
  expect(factoryCostFor("grok-4.6")).toEqual({ input: 1.6, output: 4.8, cacheRead: 0.4, cacheWrite: 0 });
  // opus-4-8: upstream $5/$25, multiplier 2.
  expect(factoryCostFor("claude-opus-4-8")).toEqual({ input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 });
  // GLM-5.3-Flash: upstream $1.4/$4.4, multiplier 0.06.
  expect(factoryCostFor("glm-5.3-flash")).toEqual({ input: 0.084, output: 0.264, cacheRead: 0.0156, cacheWrite: 0 });
 });

 test("unknown ids have no price", () => {
  expect(factoryCostFor("brand-new-model")).toBeUndefined();
 });
});

describe("FACTORY_MODELS", () => {
 test("ids are unique", () => {
  const ids = FACTORY_MODELS.map((model) => model.id);
  expect(new Set(ids).size).toBe(ids.length);
 });

 test("every entry resolves a routable family and upstream", () => {
  for (const model of FACTORY_MODELS) {
   expect(familyOf(model.id), model.id).not.toBe("unsupported");
   expect(upstreamProviderFor(model.id), model.id).toBeDefined();
  }
 });

 test("covers the models Factory documents today", () => {
  const ids = new Set(FACTORY_MODELS.map((model) => model.id));
  for (const id of [
   "grok-4.6",
   "grok-4.5",
   "gemini-3.7-flash",
   "gpt-5.6-sol",
   "claude-opus-5",
   "kimi-k3",
   "inkling",
   "deepseek-v4-flash-0731",
   "glm-5.3-flash",
   "kimi-k2.7-code",
  ]) {
   expect(ids.has(id), id).toBe(true);
  }
 });

 test("grok-4.6 exposes Low, Medium, High, and Extra high thinking", () => {
  const grok46 = FACTORY_MODELS.find((model) => model.id === "grok-4.6");
  const grok45 = FACTORY_MODELS.find((model) => model.id === "grok-4.5");

  expect(grok46?.thinking?.efforts?.join(",")).toBe("low,medium,high,xhigh");
  expect(grok45?.thinking?.efforts?.join(",")).toBe("low,medium,high");
  expect(grokThinking("grok-4.6")?.efforts.join(",")).toBe("low,medium,high,xhigh");
  expect(grokReasoningEffortMap("grok-4.6")).toEqual({ minimal: "low" });
  expect(grokReasoningEffortMap("grok-4.5")).toEqual({ minimal: "low", xhigh: "high" });
 });
});
