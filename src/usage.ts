import type {
  UsageFetchContext,
  UsageFetchParams,
  UsageLimit,
  UsageProvider,
  UsageReport,
  UsageStatus,
} from "@oh-my-pi/pi-ai";

import { FACTORY_API, FACTORY_API_BASE_OVERRIDDEN, FACTORY_HEADERS, PROVIDER_ID } from "./constants";

/**
 * Factory account/quota reporting for Oh My Pi's native `/usage`.
 *
 * Droid 0.181.0 calls `GET {apiEndpoint}/api/billing/limits` with the OAuth
 * bearer and Droid-compatible client headers. A live probe showed the endpoint
 * accepts the OAuth token (with or without an organization header) and rejects
 * `fk-...` API keys with 401, so this fetcher is intentionally OAuth-only.
 */

const BILLING_LIMITS_PATH = "/api/billing/limits";
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type TierId = "standard" | "core";
type WindowId = "5h" | "weekly" | "monthly";

interface TierBucketSpec {
  tier: TierId;
  payloadKey: "fiveHour" | "weekly" | "monthly";
  windowId: WindowId;
  label: string;
  windowLabel: string;
  /** Omitted for monthly: Factory's monthly window is calendar-based. */
  durationMs?: number;
}

/** Fixed emission order: all Standard windows, then all Droid Core windows. */
const TIER_BUCKETS: readonly TierBucketSpec[] = [
  { tier: "standard", payloadKey: "fiveHour", windowId: "5h", label: "Standard 5 Hour", windowLabel: "5 Hour", durationMs: FIVE_HOURS_MS },
  { tier: "standard", payloadKey: "weekly", windowId: "weekly", label: "Standard Weekly", windowLabel: "Weekly", durationMs: WEEK_MS },
  { tier: "standard", payloadKey: "monthly", windowId: "monthly", label: "Standard Monthly", windowLabel: "Monthly" },
  { tier: "core", payloadKey: "fiveHour", windowId: "5h", label: "Droid Core 5 Hour", windowLabel: "5 Hour", durationMs: FIVE_HOURS_MS },
  { tier: "core", payloadKey: "weekly", windowId: "weekly", label: "Droid Core Weekly", windowLabel: "Weekly", durationMs: WEEK_MS },
  { tier: "core", payloadKey: "monthly", windowId: "monthly", label: "Droid Core Monthly", windowLabel: "Monthly" },
];

/**
 * Top-level keys that mark a body as a billing-limits response. A 2xx body
 * without any of them is treated as an unrecognized payload (transport-level
 * failure) rather than a valid legacy/unlimited account.
 */
const RECOGNIZED_PAYLOAD_KEYS = [
  "limits",
  "planType",
  "extraUsageBalanceCents",
  "extraUsageAllowed",
  "overagePreference",
  "usesTokenRateLimitsBilling",
  "tokenRateLimitsRolloutEligible",
] as const;

export interface FactoryUsageParseContext {
  /** Factory organization id (from `OAuthCredentials.accountId`). */
  accountId?: string;
  email?: string;
  /** Resolved Factory API base the payload was fetched from. */
  endpoint: string;
  fetchedAt: number;
}

function parseTierBucket(
  bucket: unknown,
  spec: TierBucketSpec,
  context: FactoryUsageParseContext,
): UsageLimit | undefined {
  if (typeof bucket !== "object" || bucket === null) return undefined;
  const record = bucket as Record<string, unknown>;
  const usedPercent = record.usedPercent;
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) return undefined;
  const used = Math.min(100, Math.max(0, usedPercent));

  const windowEndMs = typeof record.windowEnd === "string" ? Date.parse(record.windowEnd) : Number.NaN;
  const secondsRemaining =
    typeof record.secondsRemaining === "number" &&
    Number.isFinite(record.secondsRemaining) &&
    record.secondsRemaining >= 0
      ? record.secondsRemaining
      : undefined;
  // Prefer the absolute window end; only fall back to the relative seconds
  // when windowEnd is absent or unparseable.
  const resetsAt = Number.isFinite(windowEndMs)
    ? windowEndMs
    : secondsRemaining !== undefined
      ? context.fetchedAt + secondsRemaining * 1000
      : undefined;

  // A bucket whose reset is not in the future and that reports no remaining
  // seconds has no live window (e.g. Droid Core allowances on a Standard-only
  // plan). Keep it visible but neutral so it does not look available.
  const hasActiveWindow = (resetsAt !== undefined && resetsAt > context.fetchedAt) || secondsRemaining !== undefined;

  let status: UsageStatus;
  const notes: string[] = [];
  if (!hasActiveWindow) {
    status = "unknown";
    notes.push("No active window for this plan");
  } else if (used >= 100) {
    status = "exhausted";
  } else if (used >= 90) {
    status = "warning";
  } else {
    status = "ok";
  }

  return {
    id: `${PROVIDER_ID}:${spec.tier}:${spec.windowId}`,
    label: spec.label,
    scope: {
      provider: PROVIDER_ID,
      tier: spec.tier,
      windowId: spec.windowId,
      shared: true,
      ...(context.accountId ? { accountId: context.accountId, orgId: context.accountId } : {}),
    },
    window: {
      id: spec.windowId,
      label: spec.windowLabel,
      ...(spec.durationMs !== undefined ? { durationMs: spec.durationMs } : {}),
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    },
    amount: {
      used,
      limit: 100,
      remaining: 100 - used,
      usedFraction: used / 100,
      remainingFraction: (100 - used) / 100,
      unit: "percent",
    },
    status,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/**
 * Pure normalizer for the `/api/billing/limits` payload. Returns `null` when
 * the body is not a recognized billing-limits response; returns a report with
 * zero limits for a recognized response that carries no usable bucket (valid
 * legacy/unlimited account).
 */
export function parseFactoryUsagePayload(
  payload: unknown,
  context: FactoryUsageParseContext,
): UsageReport | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (!RECOGNIZED_PAYLOAD_KEYS.some((key) => key in body)) return null;

  const limits: UsageLimit[] = [];
  const rawLimits = body.limits;
  const payloadLimits =
    typeof rawLimits === "object" && rawLimits !== null ? (rawLimits as Record<string, unknown>) : undefined;

  for (const spec of TIER_BUCKETS) {
    const tierSection = payloadLimits?.[spec.tier];
    const bucket =
      typeof tierSection === "object" && tierSection !== null
        ? (tierSection as Record<string, unknown>)[spec.payloadKey]
        : undefined;
    const limit = parseTierBucket(bucket, spec, context);
    if (limit) limits.push(limit);
  }

  const balanceCents = body.extraUsageBalanceCents;
  if (typeof balanceCents === "number" && Number.isFinite(balanceCents) && balanceCents >= 0) {
    const notes: string[] = [];
    if (typeof body.extraUsageAllowed === "boolean") {
      notes.push(`Extra usage ${body.extraUsageAllowed ? "allowed" : "not allowed"}`);
    }
    if (typeof body.overagePreference === "string" && body.overagePreference.trim().length > 0) {
      notes.push(`Overage preference: ${body.overagePreference}`);
    }
    limits.push({
      id: `${PROVIDER_ID}:extra-usage-balance`,
      label: "Extra Usage balance",
      scope: {
        provider: PROVIDER_ID,
        shared: true,
        ...(context.accountId ? { accountId: context.accountId, orgId: context.accountId } : {}),
      },
      amount: { unit: "usd", remaining: balanceCents / 100 },
      ...(notes.length > 0 ? { notes } : {}),
    });
  }

  const metadata: Record<string, unknown> = { endpoint: context.endpoint };
  if (context.accountId) {
    metadata.accountId = context.accountId;
    metadata.orgId = context.accountId;
  }
  if (context.email) metadata.email = context.email;
  if (typeof body.planType === "string") metadata.planType = body.planType;
  if (typeof body.tokenRateLimitsRolloutEligible === "boolean") {
    metadata.tokenRateLimitsRolloutEligible = body.tokenRateLimitsRolloutEligible;
  }
  if (typeof body.usesTokenRateLimitsBilling === "boolean") {
    metadata.usesTokenRateLimitsBilling = body.usesTokenRateLimitsBilling;
  }
  if (typeof body.extraUsageAllowed === "boolean") metadata.extraUsageAllowed = body.extraUsageAllowed;
  if (typeof body.overagePreference === "string") metadata.overagePreference = body.overagePreference;

  return {
    provider: PROVIDER_ID,
    fetchedAt: context.fetchedAt,
    limits,
    ...(body.usesTokenRateLimitsBilling === true
      ? { notes: ["This plan bills usage with token-based rate limits; window percentages reflect token quotas."] }
      : {}),
    metadata,
  };
}

/** Same base-URL precedence as model routing in router.ts. */
function resolveUsageBaseUrl(params: UsageFetchParams): string {
  const base = FACTORY_API_BASE_OVERRIDDEN ? FACTORY_API : (params.credential.apiEndpoint ?? FACTORY_API);
  return base.replace(/\/+$/, "");
}

export const factoryUsageProvider = {
  id: PROVIDER_ID,
  // The endpoint authenticates the bearer, so a fetch doubles as a health check.
  validatesCredentials: true,

  supports(params: UsageFetchParams): boolean {
    // OAuth-only: the live `fk-...` API-key probe returned 401, so never send
    // API-key credentials to this endpoint.
    return (
      params.provider === PROVIDER_ID &&
      params.credential.type === "oauth" &&
      (params.credential.accessToken?.trim().length ?? 0) > 0
    );
  },

  async fetchUsage(params: UsageFetchParams, ctx: UsageFetchContext): Promise<UsageReport | null> {
    const credential = params.credential;
    // Defense in depth alongside supports(): the billing endpoint is
    // OAuth-only, and UsageCredential allows accessToken on any discriminant,
    // so refuse API-key credentials here too rather than trust every caller.
    if (credential.type !== "oauth") return null;
    const accessToken = credential.accessToken?.trim();
    if (!accessToken) return null;

    const base = resolveUsageBaseUrl(params);
    const headers: Record<string, string> = {
      ...FACTORY_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };
    if (credential.accountId) {
      headers["X-Factory-Org-Id"] = credential.accountId;
    }

    let response: Response;
    try {
      response = await ctx.fetch(`${base}${BILLING_LIMITS_PATH}`, {
        method: "GET",
        headers,
        signal: params.signal,
      });
    } catch (error) {
      if (params.signal?.aborted || (error instanceof Error && error.name === "AbortError")) return null;
      // Never log the error message: transport errors can embed request
      // details (including the Authorization header) from proxy/custom fetch
      // implementations. The error class name is enough to diagnose.
      ctx.logger?.warn("Factory usage fetch failed", {
        reason: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }

    if (!response.ok) {
      ctx.logger?.warn("Factory usage request was rejected", { status: response.status });
      return null;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (params.signal?.aborted || (error instanceof Error && error.name === "AbortError")) return null;
      ctx.logger?.warn("Factory usage response was not valid JSON", { status: response.status });
      return null;
    }

    const report = parseFactoryUsagePayload(payload, {
      accountId: credential.accountId,
      email: credential.email,
      endpoint: base,
      fetchedAt: Date.now(),
    });
    if (!report) {
      ctx.logger?.warn("Factory usage response was not a recognized billing-limits payload", {
        status: response.status,
      });
      return null;
    }
    return report;
  },
} satisfies UsageProvider;
