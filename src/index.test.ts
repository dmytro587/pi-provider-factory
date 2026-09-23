import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ExtensionAPI, ProviderConfig, ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";

import { FACTORY_MODELS } from "./catalog";
import { PROVIDER_ID } from "./constants";
import registerFactoryProvider from "./index";
import { fetchFactoryDynamicModels } from "./model-refresh";

function recordRegistrations(): { name: string; config: ProviderConfig }[] {
  const recorded: { name: string; config: ProviderConfig }[] = [];
  const pi = {
    registerProvider(name: string, config: ProviderConfig) {
      recorded.push({ name, config });
    },
    on() {
      // Session-start refresh is out of scope for these assertions.
    },
  } as unknown as ExtensionAPI;
  registerFactoryProvider(pi);
  return recorded;
}

describe("registerFactoryProvider", () => {
  const recorded = recordRegistrations();

  test("registers factory twice: static catalog first, then dynamic discovery", () => {
    expect(recorded.map((entry) => entry.name)).toEqual([PROVIDER_ID, PROVIDER_ID]);
  });

  test("only the first registration carries the curated static catalog", () => {
    expect(recorded[0]?.config.models).toBe(FACTORY_MODELS);
    expect(recorded[1]?.config.models).toBeUndefined();
  });

  test("only the second registration installs the dynamic model fetcher", () => {
    // A combined config would silently disable discovery: omp's
    // registerProvider() returns from the non-empty `models` branch first.
    expect(recorded[0]?.config.fetchDynamicModels).toBeUndefined();
    expect(recorded[1]?.config.fetchDynamicModels).toBe(fetchFactoryDynamicModels);
  });

  test("only the first registration owns streaming, usage, and OAuth", () => {
    expect(recorded[0]?.config.streamSimple).toBeDefined();
    expect(recorded[0]?.config.usage).toBeDefined();
    expect(recorded[0]?.config.usage?.id).toBe(PROVIDER_ID);
    expect(recorded[0]?.config.oauth).toBeDefined();
    expect(recorded[1]?.config.streamSimple).toBeUndefined();
    expect(recorded[1]?.config.usage).toBeUndefined();
    expect(recorded[1]?.config.oauth).toBeUndefined();
  });

  test("both registrations share identical transport and auth routing", () => {
    const [staticConfig, discoveryConfig] = [recorded[0]?.config, recorded[1]?.config];
    expect(staticConfig?.api).toBe(discoveryConfig?.api);
    expect(staticConfig?.baseUrl).toBe(discoveryConfig?.baseUrl);
    expect(staticConfig?.apiKey).toBe(discoveryConfig?.apiKey);
    expect(staticConfig?.headers).toBe(discoveryConfig?.headers);
  });
});

describe("factory models stay available across a pending online refresh", () => {
  test("curated catalog is present before, during, and after discovery", async () => {
    const recorded = recordRegistrations();
    const staticConfig = recorded[0]!.config;
    const discoveryConfig = recorded[1]!.config;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-registry-test-"));
    const authStorage = await AuthStorage.create(path.join(dir, "auth.db"));
    try {
      const registry = new ModelRegistry(authStorage, path.join(dir, "models.yml"));
      const deferred = Promise.withResolvers<readonly ProviderModelConfig[]>();
      const sourceId = "factory-provider-test";

      registry.registerProvider(
        PROVIDER_ID,
        {
          api: staticConfig.api,
          baseUrl: staticConfig.baseUrl,
          headers: staticConfig.headers,
          apiKey: "test-key",
          models: staticConfig.models,
        },
        sourceId,
      );
      registry.registerProvider(
        PROVIDER_ID,
        {
          api: discoveryConfig.api,
          baseUrl: discoveryConfig.baseUrl,
          headers: discoveryConfig.headers,
          apiKey: "test-key",
          fetchDynamicModels: () => deferred.promise,
        },
        sourceId,
      );

      const factoryIds = () =>
        new Set(registry.getAvailable().filter((model) => model.provider === PROVIDER_ID).map((model) => model.id));
      const expectAllCurated = (stage: string) => {
        const ids = factoryIds();
        const missing = FACTORY_MODELS.map((model) => model.id).filter((id) => !ids.has(id));
        expect(missing, `missing factory models ${stage}`).toEqual([]);
      };

      expectAllCurated("after registration");

      // Kick off discovery WITHOUT awaiting: refreshProvider() destroys and
      // reloads the static model set synchronously before its first await, so
      // this is exactly the window where the Factory tab used to vanish.
      const refresh = registry.refreshProvider(PROVIDER_ID, "online");
      expectAllCurated("while the online refresh is pending");
      await Promise.resolve();
      expectAllCurated("after a microtask turn with the refresh still pending");

      deferred.resolve(FACTORY_MODELS);
      await refresh;
      expectAllCurated("after discovery resolved");
    } finally {
      authStorage.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
