import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import type { Api, Model, ModelSpec } from "@oh-my-pi/pi-catalog/types";
import { createProviderErrorMessage } from "@oh-my-pi/pi-ai/providers/error-message";
import { AssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import { streamSimple, type AssistantMessage, type Context } from "@oh-my-pi/pi-ai";

import { familyOf, grokReasoningEffortMap, grokThinking, upstreamProviderFor } from "./catalog";
import {
  ANTHROPIC_VERSION,
  FACTORY_API,
  FACTORY_API_BASE_OVERRIDDEN,
  FACTORY_HEADERS,
  FACTORY_OPENAI_PLATFORM_ORG,
  FACTORY_CLIENT_VERSION,
  FACTORY_ORG_ID,
  PROVIDER_ID,
} from "./constants";

type FactoryTargetApi = "anthropic-messages" | "openai-responses" | "openai-completions";

type ParsedCredential = {
  access?: string;
  orgId: string | null;
  apiEndpoint: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringField(record, key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;

  return atob(padded);
}

function orgIdFromAccessToken(accessToken: string): string | null {
  const [, payloadSegment] = accessToken.split(".");

  if (!payloadSegment) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(decodeBase64Url(payloadSegment));

    if (!isRecord(payload)) {
      return null;
    }

    return (
      firstStringField(payload, ["external_org_id", "org_id", "organization_id", "organizationId", "orgId"]) ?? null
    );
  } catch {
    return null;
  }
}

function parseCredential(raw: string | undefined): ParsedCredential {
  if (!raw) {
    return { orgId: null, apiEndpoint: null };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (isRecord(parsed) && typeof parsed.access === "string" && parsed.access.length > 0) {
      const parsedOrgId = typeof parsed.orgId === "string" && parsed.orgId.length > 0 ? parsed.orgId : null;

      return {
        access: parsed.access,
        orgId: parsedOrgId ?? orgIdFromAccessToken(parsed.access),
        apiEndpoint: typeof parsed.apiEndpoint === "string" && parsed.apiEndpoint.length > 0 ? parsed.apiEndpoint : null,
      };
    }
  } catch {
    return {
      access: raw,
      orgId: orgIdFromAccessToken(raw),
      apiEndpoint: null,
    };
  }
  return {
    access: raw,
    orgId: orgIdFromAccessToken(raw),
    apiEndpoint: null,
  };
}

function errorStream(model: Model<Api>, message: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  const error = createProviderErrorMessage(model, new Error(message));
  stream.push({ type: "error", reason: "error", error });

  return stream;
}

type FactoryDiagnosticArgs = {
  model: Model<Api>;
  targetApi: FactoryTargetApi;
  credential: ParsedCredential;
  apiEndpoint: string;
};

function looksLikeFactoryForbidden(status: number | undefined, message: string | undefined): boolean {
  if (status === 403) {
    return true;
  }

  if (!message) {
    return false;
  }

  return message.startsWith("403") && /forbidden/i.test(message);
}

function redactIdentifier(value: string | null | undefined): string {
  if (!value) {
    return "missing";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function statusFromUnknownError(error: unknown): number | undefined {
  if (isRecord(error) && typeof error.status === "number") {
    return error.status;
  }

  return undefined;
}

function factoryForbiddenDiagnostic(args: FactoryDiagnosticArgs & { originalMessage: string | undefined }): string {
  const orgId = args.credential.orgId ?? FACTORY_ORG_ID;
  const redactedOrgId = redactIdentifier(orgId);
  const credentialApiEndpoint = args.credential.apiEndpoint ?? "default";
  const baseOverride = FACTORY_API_BASE_OVERRIDDEN ? "yes" : "no";
  const upstream = args.originalMessage ?? "403 Forbidden";

  return (
    `factory: Factory gateway returned 403 Forbidden for ${args.model.provider}/${args.model.id} ` +
    `via ${args.targetApi} at ${args.apiEndpoint}. ` +
    "The credential resolved, but Factory refused the LLM request. " +
    "Check Factory org/model entitlement for this account, unset FACTORY_API_KEY/FACTORY_API_BASE if they are " +
    "overriding OAuth, then run `/logout factory` and `/login factory` if the org changed. " +
    `Request context: X-Factory-Org-Id=${redactedOrgId}; credentialApiEndpoint=${credentialApiEndpoint}; ` +
    `FACTORY_API_BASE override=${baseOverride}. ` +
    `Upstream response: ${upstream}`
  );
}

function enrichFactoryForbiddenError(message: AssistantMessage, args: FactoryDiagnosticArgs): AssistantMessage {
  if (!looksLikeFactoryForbidden(message.errorStatus, message.errorMessage)) {
    return message;
  }

  return {
    ...message,
    errorMessage: factoryForbiddenDiagnostic({ ...args, originalMessage: message.errorMessage }),
  };
}

function wrapThrownFactoryForbidden(error: unknown, args: FactoryDiagnosticArgs): unknown {
  if (!(error instanceof Error) || !looksLikeFactoryForbidden(statusFromUnknownError(error), error.message)) {
    return error;
  }

  return new Error(factoryForbiddenDiagnostic({ ...args, originalMessage: error.message }), { cause: error });
}

function routeWithFactoryDiagnostics(
  inner: AssistantMessageEventStream,
  args: FactoryDiagnosticArgs,
): AssistantMessageEventStream {
  const outer = new AssistantMessageEventStream();

  void (async () => {
    try {
      for await (const event of inner) {
        if (event.type === "error") {
          outer.push({ ...event, error: enrichFactoryForbiddenError(event.error, args) });
        } else {
          outer.push(event);
        }

        if (outer.done) {
          return;
        }
      }

      if (!outer.done) {
        outer.end(await inner.result());
      }
    } catch (error) {
      outer.fail(wrapThrownFactoryForbidden(error, args));
    }
  })();

  return outer;
}

function targetApiFor(modelId: string): FactoryTargetApi | null {
  // MiniMax is a Droid Core (open) model, but Factory serves it through the
  // Anthropic-compatible endpoint (observed in droid 0.153.1), not the OpenAI
  // chat-completions endpoint used by the other open models.
  if (modelId.startsWith("minimax-")) {
    return "anthropic-messages";
  }

  switch (familyOf(modelId)) {
    case "anthropic":
      return "anthropic-messages";
    // Grok rides the OpenAI Responses wire through Factory's gateway
    // (droid 0.210.0 gateway map: xai → /api/llm/o/v1/responses); only the
    // `x-api-provider` upstream differs.
    case "openai-responses":
    case "xai-responses":
      return "openai-responses";
    // Gemini rides the OpenAI chat-completions wire (x-api-provider: google;
    // live-verified 200 on 0.209.0 headers with a system-role message).
    case "google-completions":
    case "openai-completions":
      return "openai-completions";
    case "unsupported":
      return null;
  }
}

function randomHeaderId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function buildRequestHeaders(options: Parameters<NonNullable<ProviderConfig["streamSimple"]>>[2]): Record<string, string> {
  return {
    "x-session-id": options?.sessionId ?? randomHeaderId("session"),
    "x-assistant-message-id": randomHeaderId("assistant"),
  };
}

const CONTRACT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".contract");

function droidSystemPromptPath(targetApi: FactoryTargetApi): string {
  const route =
    targetApi === "anthropic-messages" ? "messages" : targetApi === "openai-responses" ? "responses" : "chat";

  return path.join(CONTRACT_DIR, `droid-${FACTORY_CLIENT_VERSION}-system-${route}.txt`);
}

export function loadDroidSystemPrompt(targetApi: FactoryTargetApi) {
  try {
    const text = fs.readFileSync(droidSystemPromptPath(targetApi), "utf8");
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

// Live-verify on Droid 0.209.0: verbatim Droid body + omp token = 200 on every
// route; empty system and generic/"helpful assistant" system = 403. So OMP's
// own prompt cannot occupy the system channel. Fold it into the first user
// message, then prefix the locally captured Droid prompt (gitignored under
// `.contract/`) as the system field. That file is not committed.
export function foldSystemPromptIntoUserMessage(context: Context): Context {
  const systemText = context.systemPrompt?.filter((part) => part.length > 0).join("\n\n");

  if (!systemText) {
    return context;
  }

  const systemPreamble = `<system>\n${systemText}\n</system>\n\n`;
  const [firstMessage, ...restMessages] = context.messages;

  if (firstMessage?.role === "user") {
    const content =
      typeof firstMessage.content === "string"
        ? `${systemPreamble}${firstMessage.content}`
        : [{ type: "text" as const, text: systemPreamble }, ...firstMessage.content];

    return {
      ...context,
      systemPrompt: undefined,
      messages: [{ ...firstMessage, content }, ...restMessages],
    };
  }

  return {
    ...context,
    systemPrompt: undefined,
    messages: [
      {
        role: "user",
        content: systemPreamble,
        synthetic: true,
        timestamp: Date.now(),
      },
      ...context.messages,
    ],
  };
}

// omp 18.x materializes registered models through its own buildModel, tagging
// each with an `identity` record (`{ class, family?, revision? }`) that its
// request path dereferences unconditionally (`model.identity.class` — gpt-oss
// detection in the OpenAI-family message converters, service-tier family
// resolution). omp's extension import shim swaps `@oh-my-pi/pi-ai` for its
// bundled 18.x code but leaves `@oh-my-pi/pi-catalog` on this repo's pinned
// 16.x, whose buildModel emits no identity. The identity omp resolved for the
// session model (same provider, same id, so the same classification) must be
// carried onto the gateway target explicitly, or every Factory request on the
// Responses wire dies with "undefined is not an object (evaluating
// 'e.identity.class')" before any network call and omp falls back to another
// model.
// Mirrors omp's bounded-token classification for the model families this
// provider ships, so a session model that arrives without an identity record
// (omp < 18, or a static-overlay model that was never re-materialized) still
// gets one. `class` drives omp 18's gpt-oss detection, thinking-loop guard
// (xai/gemini/deepseek), and service-tier family resolution.
type OmpModelIdentity = { class: string; family?: string; revision?: string };

function identityFor(model: Model<Api>): OmpModelIdentity {
  const { identity } = model as Model<Api> & { identity?: OmpModelIdentity };

  if (identity) {
    return identity;
  }

  const id = model.id.toLowerCase();

  if (id.startsWith("grok-")) {
    const version = /^grok-(\d+(?:\.\d+)*)/.exec(id)?.[1];
    const revision = version === undefined ? undefined : version.split(".").length >= 3 ? version : `${version}.0`;

    return { class: "xai", family: "grok", ...(revision ? { revision } : {}) };
  }

  const identityClassByPrefix: [string, string][] = [
    ["claude-", "anthropic"],
    ["gpt-", "openai"],
    ["gemini-", "gemini"],
    ["glm-", "glm"],
    ["kimi-", "kimi"],
    ["deepseek-", "deepseek"],
    ["minimax-", "minimax"],
    ["nemotron-", "nvidia"],
  ];
  const matched = identityClassByPrefix.find(([prefix]) => id.startsWith(prefix));

  return matched ? { class: matched[1] } : { class: "unknown" };
}

export function buildTargetModel(
  model: Model<Api>,
  targetApi: FactoryTargetApi,
  orgId: string | null,
  apiEndpoint: string,
): Model<FactoryTargetApi> & { identity?: OmpModelIdentity } {
  const isAnthropic = targetApi === "anthropic-messages";
  const baseUrl = isAnthropic ? `${apiEndpoint}/api/llm/a` : `${apiEndpoint}/api/llm/o/v1`;
  const headers: Record<string, string> = { ...FACTORY_HEADERS, "x-api-provider": upstreamProviderFor(model.id) };

  if (isAnthropic) {
    headers["anthropic-version"] = ANTHROPIC_VERSION;
    // Droid 0.209.0 sends a single beta flag; the July two-flag list is gone.
    headers["anthropic-beta"] = "fine-grained-tool-streaming-2025-05-14";
  }

  if (targetApi === "openai-completions") {
    headers["x-provider-routing-source"] = "registry_default";
  }

  // OpenAI-Platform org and session_lock only apply to the OpenAI upstream;
  // Grok shares the Responses wire but 403s under an OpenAI platform org.
  if (targetApi === "openai-responses" && upstreamProviderFor(model.id) === "openai") {
    headers["OpenAI-Platform"] = FACTORY_OPENAI_PLATFORM_ORG;
    headers["x-provider-routing-source"] = "session_lock";
  }

  if (orgId) {
    headers["X-Factory-Org-Id"] = orgId;
  }

  const grokEffortMap = grokReasoningEffortMap(model.id);
  const spec: ModelSpec<FactoryTargetApi> & { identity?: OmpModelIdentity } = {
    provider: PROVIDER_ID,
    id: model.id,
    name: model.name,
    api: targetApi,
    baseUrl,
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    premiumMultiplier: model.premiumMultiplier,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    thinking: grokThinking(model.id) ?? model.thinking,
    headers,
    identity: identityFor(model),
    // Factory's chat/responses gate looks at a `system` role (or top-level
    // `instructions`). omp would otherwise emit `developer` for reasoning
    // models on OpenAI-shaped hosts.
    ...(targetApi === "openai-completions" || targetApi === "openai-responses"
      ? {
        compat: {
          supportsDeveloperRole: false,
          ...(grokEffortMap ? { supportsReasoningEffort: true, reasoningEffortMap: grokEffortMap } : {}),
        },
      }
      : {}),
  };

  return buildModel(spec);
}

export const factoryStreamSimple: NonNullable<ProviderConfig["streamSimple"]> = (model, context, options) => {
  const rawApiKey = typeof options?.apiKey === "string" ? options.apiKey : undefined;
  const credential = parseCredential(rawApiKey);

  if (!credential.access) {
    return errorStream(model, "factory: no Factory credential; run `/login factory`");
  }

  const targetApi = targetApiFor(model.id);

  if (!targetApi) {
    return errorStream(model, `factory: model ${model.id} is not supported in v1 (Gemini/other)`);
  }

  try {
    const apiEndpoint = FACTORY_API_BASE_OVERRIDDEN ? FACTORY_API : credential.apiEndpoint ?? FACTORY_API;
    const target = buildTargetModel(model, targetApi, credential.orgId ?? FACTORY_ORG_ID, apiEndpoint);

    const folded = foldSystemPromptIntoUserMessage(context);
    const droidSystemPrompt = loadDroidSystemPrompt(targetApi);
    if (!droidSystemPrompt) {
      return errorStream(
        model,
        "factory: missing local Droid system prompt under .contract/; run `bun run capture:contract` then retry",
      );
    }
    const routedContext = { ...folded, systemPrompt: [droidSystemPrompt] };

    const inner = streamSimple(target, routedContext, {
      ...options,
      apiKey: credential.access,
      headers: {
        ...buildRequestHeaders(options),
        ...(options?.headers ?? {}),
      },
    });

    return routeWithFactoryDiagnostics(inner, { model, targetApi, credential, apiEndpoint });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return errorStream(model, `factory: failed to route model ${model.id}: ${message}`);
  }
};
