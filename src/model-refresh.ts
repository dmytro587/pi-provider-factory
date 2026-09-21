import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";

import { FACTORY_MODELS, factoryModel, familyOf, modelSize } from "./catalog";
import { FACTORY_API, FACTORY_HEADERS } from "./constants";

const FACTORY_MODEL_DOCS_URL = "https://docs.factory.ai/models.md";
const FACTORY_FEATURE_FLAGS_URL = `${FACTORY_API}/api/feature-flags`;

export type FactoryModelDocsEntry = {
  id: string;
  displayName: string;
  reasoning: string;
};

function stripDocsMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/\\(.)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Section-independent: the model ID's family is the only gate. Any table row
// with a backticked ID whose family we can route is kept, no matter which
// heading it appears under and no matter what footnote glyphs decorate it —
// new or renamed docs sections must never silently drop models.
export function parseFactoryModelDocs(markdown: string): FactoryModelDocsEntry[] {
  const entries: FactoryModelDocsEntry[] = [];

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (!line.startsWith("|")) {
      continue;
    }

    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 4) {
      continue;
    }

    // Header/separator rows have no backticked ID, so this skips them too.
    const idMatch = (cells[2] ?? "").match(/`([^`]+)`/);
    if (!idMatch) {
      continue;
    }

    const id = idMatch[1].trim();
    if (id.length === 0 || familyOf(id) === "unsupported") {
      continue;
    }

    const displayName = stripDocsMarkup(cells[1] ?? "").replace(/[\s*†‡§]+$/u, "");

    entries.push({
      id,
      displayName: displayName.length > 0 ? displayName : id,
      reasoning: cells[4] ?? "",
    });
  }

  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function displayNameForId(id: string): string {
  if (id.startsWith("glm-")) {
    const rest = id
      .slice(4)
      .split("-")
      .map((part) => (part === "flash" ? "Flash" : part === "fast" ? "Fast" : part))
      .join(" ");
    return `GLM ${rest}`;
  }

  if (id.startsWith("gemini-")) {
    const rest = id
      .slice(7)
      .split("-")
      .map((part) => (part === "flash" ? "Flash" : part === "pro" ? "Pro" : part))
      .join(" ");
    return `Gemini ${rest}`;
  }

  if (id === "inkling") {
    return "Inkling";
  }

  return id;
}

// Factory's public docs lag the CLI. Droid 0.209.0 ships `glm-5.3-flash`
// (and other live IDs) via `/api/feature-flags` `configs.provider_routing.models`
// even when models.md still lists only `glm-5.3`.
export function parseFactoryFeatureFlags(payload: unknown): FactoryModelDocsEntry[] {
  if (!isRecord(payload)) {
    return [];
  }

  const configs = payload.configs;
  if (!isRecord(configs)) {
    return [];
  }

  const routing = configs.provider_routing;
  if (!isRecord(routing)) {
    return [];
  }

  const models = routing.models;
  if (!isRecord(models)) {
    return [];
  }

  const entries: FactoryModelDocsEntry[] = [];
  for (const id of Object.keys(models)) {
    const trimmed = id.trim();
    if (trimmed.length === 0 || familyOf(trimmed) === "unsupported") {
      continue;
    }

    entries.push({
      id: trimmed,
      displayName: displayNameForId(trimmed),
      reasoning: "",
    });
  }

  return entries;
}

function docsEntryToModel(entry: FactoryModelDocsEntry): ProviderModelConfig | null {
  const family = familyOf(entry.id);
  if (family === "unsupported") {
    return null;
  }

  // Sizes come from the shared MODEL_SIZES table via modelSize(), so a live
  // discovery of e.g. grok-4.6 gets the same 200k/63,356 numbers the static
  // catalog would give it.
  const size = modelSize(entry.id);
  const label = family === "openai-completions" ? "Factory Core" : "Factory";

  return factoryModel({
    id: entry.id,
    name: `${entry.displayName} (${label})`,
    reasoning: true,
    input: size.input,
    contextWindow: size.contextWindow,
    maxTokens: size.maxTokens,
  });
}

function mergeDocsModels(entries: FactoryModelDocsEntry[]): ProviderModelConfig[] {
  const merged: ProviderModelConfig[] = [...FACTORY_MODELS];
  const seen = new Set<string>(merged.map((model) => model.id));

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      continue;
    }

    const model = docsEntryToModel(entry);
    if (!model) {
      continue;
    }

    merged.push(model);
    seen.add(entry.id);
  }

  return merged;
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

// Throws only when every live source fails. pi-catalog catches the error,
// keeps the last-good cached catalog non-authoritatively, and retries in
// 5 minutes — strictly better than returning the static fallback, which
// would be recorded as a successful authoritative fetch and drop every
// live-only model for 24 h. Docs and feature-flags are merged because
// models.md omits IDs the CLI already routes (glm-5.3-flash).
export async function fetchFactoryDynamicModels(_apiKey?: string): Promise<readonly ProviderModelConfig[]> {
  const [docsResult, flagsResult] = await Promise.allSettled([
    fetchText(FACTORY_MODEL_DOCS_URL, { Accept: "text/markdown,text/plain;q=0.9,*/*;q=0.1" }),
    fetchText(FACTORY_FEATURE_FLAGS_URL, { ...FACTORY_HEADERS, Accept: "application/json" }),
  ]);

  const entries: FactoryModelDocsEntry[] = [];
  const errors: string[] = [];

  if (docsResult.status === "fulfilled") {
    const docsEntries = parseFactoryModelDocs(docsResult.value);
    if (docsEntries.length === 0) {
      errors.push("model docs parsed to zero entries");
    } else {
      entries.push(...docsEntries);
    }
  } else {
    const reason = docsResult.reason instanceof Error ? docsResult.reason.message : "unknown";
    errors.push(`model docs fetch failed: ${reason}`);
  }

  if (flagsResult.status === "fulfilled") {
    try {
      const flagsEntries = parseFactoryFeatureFlags(JSON.parse(flagsResult.value) as unknown);
      if (flagsEntries.length === 0) {
        errors.push("feature-flags parsed to zero routable models");
      } else {
        entries.push(...flagsEntries);
      }
    } catch {
      errors.push("feature-flags response was not JSON");
    }
  } else {
    const reason = flagsResult.reason instanceof Error ? flagsResult.reason.message : "unknown";
    errors.push(`feature-flags fetch failed: ${reason}`);
  }

  if (entries.length === 0) {
    throw new Error(`factory: live model catalog empty (${errors.join("; ")})`);
  }

  return mergeDocsModels(entries);
}
