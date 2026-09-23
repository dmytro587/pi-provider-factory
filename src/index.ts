import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

import { FACTORY_MODELS } from "./catalog";
import { fetchFactoryDynamicModels } from "./model-refresh";
import { CUSTOM_API, FACTORY_API, FACTORY_API_KEY, FACTORY_HEADERS, PROVIDER_ID } from "./constants";
import { getApiKey, login, refreshToken } from "./auth";
import { factoryStreamSimple } from "./router";
import { factoryUsageProvider } from "./usage";

// Force an online catalog refresh at session start (bypassing the 24 h cache
// TTL) so newly launched Factory models appear at the next omp launch instead
// of up to a day later. Throttled per process to dedupe `/new`.
const FORCED_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
let lastForcedRefreshAt = 0;

// Shared by both registrations below so routing/auth can never drift between
// the static overlay and the discovery manager.
const FACTORY_PROVIDER_TRANSPORT = {
  api: CUSTOM_API,
  baseUrl: FACTORY_API,
  apiKey: FACTORY_API_KEY,
  headers: FACTORY_HEADERS,
} as const;

export default function registerFactoryProvider(pi: ExtensionAPI) {
  // TWO additive registrations, deliberately. omp's ModelRegistry.registerProvider()
  // returns from its non-empty `models` branch before it ever looks at
  // `fetchDynamicModels`, so a single combined config silently disables
  // discovery. Split, the curated catalog lands as a runtime overlay that
  // survives every #reloadStaticModels() cycle — so the Factory provider and
  // its models stay continuously visible while the docs fetch is in flight —
  // and the second call installs the dynamic model manager that adds
  // docs-only models when it resolves.
  pi.registerProvider(PROVIDER_ID, {
    ...FACTORY_PROVIDER_TRANSPORT,
    models: FACTORY_MODELS,
    streamSimple: factoryStreamSimple,
    usage: factoryUsageProvider,
    oauth: {
      name: "Factory (Droid)",
      login,
      refreshToken,
      getApiKey,
    },
  });

  pi.registerProvider(PROVIDER_ID, {
    ...FACTORY_PROVIDER_TRANSPORT,
    fetchDynamicModels: fetchFactoryDynamicModels,
  });

  pi.on("session_start", (_event, ctx) => {
    const now = Date.now();
    if (now - lastForcedRefreshAt < FORCED_REFRESH_INTERVAL_MS) return;
    lastForcedRefreshAt = now;
    void ctx.modelRegistry.refreshProvider(PROVIDER_ID, "online").catch(() => {
      // Discovery failures are already surfaced by omp's provider discovery
      // state; a failed forced refresh must never break session start.
    });
  });
}
