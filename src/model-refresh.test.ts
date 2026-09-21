import { afterEach, describe, expect, test } from "bun:test";

import { FACTORY_MODELS } from "./catalog";
import {
  fetchFactoryDynamicModels,
  parseFactoryFeatureFlags,
  parseFactoryModelDocs,
} from "./model-refresh";

// Replicates the live docs.factory.ai/models.md shape: section headings with
// styled spans, header/separator rows, footnote daggers, and a section
// (Google) the parser has never seen before.
const FIXTURE = `
# Models

## <span style="color:#000">Anthropic</span>

| Model | Model ID | Multiplier | Reasoning |
| --- | --- | --- | --- |
| Claude Fable 5<sup>\\*†</sup> | \`claude-fable-5\` | 4× | Standard |
| Claude Opus 4.8 | \`claude-opus-4-8\` | 2× | Standard |

## <span style="color:#000">Google</span>

| Model | Model ID | Multiplier | Reasoning |
| --- | --- | --- | --- |
| Gemini 3.5 Flash | \`gemini-3.5-flash\` | 0.5× | Standard |

## <span style="color:#000">Droid Core (Open Models)</span>

| Model | Model ID | Multiplier | Reasoning |
| --- | --- | --- | --- |
| Kimi K2.6 | \`kimi-k2.6\` | 0.4× | Standard |
| Claude Opus 4.8 | \`claude-opus-4-8\` | 2× | Standard |
`;

describe("parseFactoryModelDocs", () => {
  const entries = parseFactoryModelDocs(FIXTURE);

  test("keeps daggered rows and strips footnote glyphs from the display name", () => {
    const fable = entries.find((entry) => entry.id === "claude-fable-5");
    expect(fable).toBeDefined();
    expect(fable?.displayName).toBe("Claude Fable 5");
  });

  test("parses rows regardless of section heading", () => {
    expect(entries.some((entry) => entry.id === "kimi-k2.6")).toBe(true);
    expect(entries.some((entry) => entry.id === "claude-opus-4-8")).toBe(true);
  });

  test("keeps new families (gemini, grok) that older revisions excluded", () => {
    expect(entries.some((entry) => entry.id.startsWith("gemini-"))).toBe(true);
    expect(entries.some((entry) => entry.id.startsWith("grok-"))).toBe(true);
  });

  test("returns no entries for non-markdown input", () => {
    expect(parseFactoryModelDocs("<html>not markdown</html>")).toEqual([]);
  });
});

describe("parseFactoryFeatureFlags", () => {
  test("keeps glm-5.3-flash from provider_routing even when docs omit it", () => {
    const entries = parseFactoryFeatureFlags({
      flags: { glm_5_3_flash: true },
      configs: {
        provider_routing: {
          models: {
            "glm-5.3-flash": ["baseten", "fireworks"],
            "glm-5.3": ["baseten", "fireworks"],
            "gemini-3.5-flash": ["google"],
          },
        },
      },
    });

    expect(entries.map((entry) => entry.id).sort()).toEqual([
      "gemini-3.5-flash",
      "glm-5.3",
      "glm-5.3-flash",
    ]);
    expect(entries.find((entry) => entry.id === "glm-5.3-flash")?.displayName).toBe("GLM 5.3 Flash");
    expect(entries.find((entry) => entry.id === "gemini-3.5-flash")?.displayName).toBe("Gemini 3.5 Flash");
  });

  test("returns no entries for an empty or malformed payload", () => {
    expect(parseFactoryFeatureFlags(null)).toEqual([]);
    expect(parseFactoryFeatureFlags({})).toEqual([]);
    expect(parseFactoryFeatureFlags({ configs: { provider_routing: { models: [] } } })).toEqual([]);
  });
});

describe("fetchFactoryDynamicModels failure paths", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("throws on non-OK response instead of returning the fallback catalog", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 503 }))) as unknown as typeof fetch;
    await expect(fetchFactoryDynamicModels()).rejects.toThrow(/live model catalog empty/);
  });

  test("throws when every live source parses to zero entries", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("<html>not markdown</html>", { status: 200 }))) as unknown as typeof fetch;
    await expect(fetchFactoryDynamicModels()).rejects.toThrow(/live model catalog empty/);
  });

  test("keeps glm-5.3-flash when docs omit it but feature-flags list it", async () => {
    globalThis.fetch = ((url: string | URL) => {
      const href = String(url);
      if (href.includes("models.md")) {
        return Promise.resolve(new Response(FIXTURE, { status: 200 }));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            configs: {
              provider_routing: {
                models: { "glm-5.3-flash": ["fireworks"] },
              },
            },
          }),
          { status: 200 },
        ),
      );
    }) as unknown as typeof fetch;

    const models = await fetchFactoryDynamicModels();
    expect(models.some((model) => model.id === "glm-5.3-flash")).toBe(true);
    expect(FACTORY_MODELS.some((model) => model.id === "glm-5.3-flash")).toBe(true);
  });
});
