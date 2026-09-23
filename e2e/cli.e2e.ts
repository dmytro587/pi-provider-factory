/**
 * End-to-end validation of pi-provider-factory through the Oh My Pi CLI.
 *
 * Opt-in only: run with `bun run test:e2e`. Bare `bun test` never discovers
 * this file (no .test/.spec suffix).
 *
 * Tiers:
 *   1. Registration & catalog — always on; needs only the CLI and the repo.
 *   2. OAuth usage reporting — OMP_E2E_OAUTH=1; needs an active Factory
 *      OAuth credential in the source auth DB (see harness for resolution).
 *   3. API-key-only behavior — OMP_E2E_API_KEY=fk-...; asserts billing
 *      limits are never queried with an API key.
 *   4. Live model calls — OMP_E2E_MODEL_CALL=1 on top of tier 2 or 3
 *      credentials; makes one tiny Factory model request.
 *
 * Gating rule: when a tier's env flag is NOT set, its tests skip. When the
 * flag IS set but a prerequisite is missing (no credential, CLI without
 * extension usage-provider support, rejected key), tests FAIL with an
 * actionable message — an explicitly requested live run must never go green
 * by skipping its core assertion.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	AcpClient,
	cleanEnv,
	cliVersion,
	GATES,
	makeWorkspace,
	profileDir,
	profileFactoryHistoryRows,
	profileLogsContain,
	profileUsageCacheRows,
	provisionProfile,
	removeProfile,
	runCli,
	seedFactoryOAuth,
	seededFactoryAccessToken,
} from "./harness";

const RUN_ID = `${process.pid.toString(36)}-${Date.now().toString(36)}`;
const BASE_PROFILE = `e2e-base-${RUN_ID}`;
const OAUTH_PROFILE = `e2e-oauth-${RUN_ID}`;
/**
 * Configures the provider (so its catalog is visible and the api_key code
 * path exists) without any real secret. The billing-refusal test relies on
 * supports() rejecting api_key credentials, which holds for any value.
 */
const DUMMY_API_KEY = "fk-e2e-dummy-not-a-real-key";
const FACTORY_WINDOW_LABELS = [
	"Standard 5 Hour",
	"Standard Weekly",
	"Standard Monthly",
	"Droid Core 5 Hour",
	"Droid Core Weekly",
	"Droid Core Monthly",
];

const cli = await cliVersion();
const cliMissing = cli === null;
if (cliMissing) {
	console.warn(`[e2e] CLI "${process.env.OMP_E2E_CLI ?? "omp"}" not available; all e2e tests skipped`);
}

const skipIfNoCli = test.skipIf(cliMissing);

/** Retry session/set_config_option while runtime provider discovery settles. */
async function setModelWithRetries(client: AcpClient, sessionId: string, modelId: string): Promise<void> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt < 6; attempt++) {
		try {
			await client.setModel(sessionId, modelId);
			return;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			await new Promise(resolve => setTimeout(resolve, 5_000));
		}
	}
	throw new Error(
		`could not select ${modelId} after 30s (runtime provider discovery never settled; see oh-my-pi#4216): ${lastError?.message}`,
	);
}

afterAll(() => {
	removeProfile(BASE_PROFILE);
	removeProfile(OAUTH_PROFILE);
});

describe("tier 1: registration and catalog", () => {
	beforeAll(async () => {
		if (cliMissing) return;
		// The dummy key makes the provider "configured" so its catalog is
		// listed; omp hides models of providers with no credential at all.
		await provisionProfile(BASE_PROFILE, { FACTORY_API_KEY: DUMMY_API_KEY });
	}, 300_000);

	skipIfNoCli("plugin link provisions the extension into the isolated profile", () => {
		const linked = fs.existsSync(
			path.join(profileDir(BASE_PROFILE), "plugins", "node_modules", "pi-provider-factory"),
		);
		expect(linked).toBe(true);
	});

	skipIfNoCli("models find factory lists the Factory catalog", async () => {
		const result = await runCli(["--profile", BASE_PROFILE, "models", "find", "factory"], {
			env: cleanEnv({ FACTORY_API_KEY: DUMMY_API_KEY }),
			timeoutMs: 180_000,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("factory (");
		expect(result.stdout).toMatch(/claude-opus-4-8|kimi-k2\.6|glm-5\.2/);
	}, 180_000);

	// Known upstream gap: runUsageCommand constructs AuthStorage directly
	// without loading extensions, so custom usage providers never register
	// there. Un-todo when the standalone CLI loads extension usage providers.
	test.todo("omp usage (standalone CLI) surfaces extension usage providers", () => {});
});

describe("tier 2: OAuth usage reporting (OMP_E2E_OAUTH=1)", () => {
	let seededRows = 0;
	let workspace = "";
	let usageText: string | undefined;
	let usageError: Error | undefined;

	beforeAll(async () => {
		if (cliMissing || !GATES.oauth) return;
		await provisionProfile(OAUTH_PROFILE);
		workspace = makeWorkspace();
		seededRows = seedFactoryOAuth(OAUTH_PROFILE);
		if (seededRows === 0) return; // the prerequisite test reports this
		// One shared /usage run: every assertion in this tier inspects its
		// result, so no test depends on another test's execution order.
		const client = await AcpClient.start(OAUTH_PROFILE, workspace, cleanEnv());
		try {
			const sessionId = await client.newSession(workspace);
			usageText = (await client.prompt(sessionId, "/usage")).text;
		} catch (error) {
			usageError = error instanceof Error ? error : new Error(String(error));
		} finally {
			await client.close();
		}
	}, 600_000);

	afterAll(() => {
		if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
	});

	const skipUnlessOauth = test.skipIf(cliMissing || !GATES.oauth);

	skipUnlessOauth("an active Factory OAuth credential is available when the tier is explicitly enabled", () => {
		expect(
			seededRows,
			"OMP_E2E_OAUTH=1 but no active Factory OAuth credential found in the source auth DB. " +
				"Run `/login factory` first, or point OMP_E2E_SOURCE_PROFILE / OMP_E2E_SOURCE_AUTH_DB at one that has it.",
		).toBeGreaterThan(0);
	});

	skipUnlessOauth("/usage reports Factory windows through the ACP session", () => {
		if (seededRows === 0) return; // covered by the prerequisite test above
		expect(usageError, `ACP /usage run failed: ${usageError?.message}`).toBeUndefined();
		expect(
			usageText,
			`Factory section missing from /usage with CLI ${cli}. Check extension loading and ` +
				"the Factory OAuth credential. Raw output: " +
				JSON.stringify((usageText ?? "").slice(0, 400)),
		).toContain("Factory");
		const windows = FACTORY_WINDOW_LABELS.filter(label => usageText!.includes(label));
		expect(
			windows.length,
			`expected Factory usage windows in /usage output, found ${windows.length}: ${JSON.stringify((usageText ?? "").slice(0, 400))}`,
		).toBeGreaterThan(0);
	});

	skipUnlessOauth("usage cache entry and per-window history rows are recorded", () => {
		if (seededRows === 0) return;
		expect(usageError, `cannot assert cache/history: the shared /usage run failed (${usageError?.message})`).toBeUndefined();
		expect(profileUsageCacheRows(OAUTH_PROFILE)).toBeGreaterThan(0);
		expect(profileFactoryHistoryRows(OAUTH_PROFILE)).toBeGreaterThanOrEqual(6);
	});

	skipUnlessOauth("the OAuth bearer token never appears in profile logs", () => {
		if (seededRows === 0) return;
		expect(usageError, `cannot assert log hygiene: the shared /usage run failed (${usageError?.message})`).toBeUndefined();
		const token = seededFactoryAccessToken(OAUTH_PROFILE);
		expect(token).not.toBeNull();
		expect(profileLogsContain(OAUTH_PROFILE, token!)).toBe(false);
	});

	test.skipIf(cliMissing || !GATES.oauth || !GATES.modelCall)(
		"a live Factory model call succeeds over OAuth (OMP_E2E_MODEL_CALL=1)",
		async () => {
			if (seededRows === 0) return; // covered by the prerequisite test above
			const client = await AcpClient.start(OAUTH_PROFILE, workspace, cleanEnv());
			try {
				const sessionId = await client.newSession(workspace);
				await setModelWithRetries(client, sessionId, "factory/kimi-k2.5");
				const { text, stopReason } = await client.prompt(sessionId, "Reply with exactly: ok");
				expect(
					stopReason,
					`Factory OAuth model call did not complete (pre-existing routing/gateway defect under investigation). ` +
						`Response: ${JSON.stringify(text.slice(0, 200))}`,
				).toBe("end_turn");
				expect(text.toLowerCase()).toContain("ok");
			} finally {
				await client.close();
			}
		},
		240_000,
	);
});

describe("tier 3: API-key-only behavior", () => {
	let workspace = "";

	beforeAll(() => {
		if (cliMissing) return;
		workspace = makeWorkspace();
	});

	afterAll(() => {
		if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
	});

	// Ungated by design: this test makes no authenticated request at all —
	// that is exactly what it proves. With OMP_E2E_API_KEY set it uses the
	// real key; otherwise a dummy exercises the same supports() refusal.
	skipIfNoCli(
		"billing limits are never queried or reported with an API key",
		async () => {
			// BASE_PROFILE is provisioned in tier 1 and intentionally has no
			// Factory OAuth row: only FACTORY_API_KEY is in play here.
			const client = await AcpClient.start(
				BASE_PROFILE,
				workspace,
				cleanEnv({ FACTORY_API_KEY: GATES.apiKey ?? DUMMY_API_KEY }),
			);
			try {
				const sessionId = await client.newSession(workspace);
				await client.prompt(sessionId, "/usage");
			} finally {
				await client.close();
			}
			expect(
				profileLogsContain(BASE_PROFILE, "billing/limits"),
				"Factory billing-limits endpoint was queried with an API key; the fetcher must stay OAuth-only",
			).toBe(false);
			expect(profileUsageCacheRows(BASE_PROFILE)).toBe(0);
		},
		180_000,
	);

	test.skipIf(cliMissing || !GATES.apiKey || !GATES.modelCall)(
		"a live Factory model call succeeds with FACTORY_API_KEY (OMP_E2E_MODEL_CALL=1)",
		async () => {
			const client = await AcpClient.start(
				BASE_PROFILE,
				workspace,
				cleanEnv({ FACTORY_API_KEY: GATES.apiKey! }),
			);
			try {
				const sessionId = await client.newSession(workspace);
				await setModelWithRetries(client, sessionId, "factory/kimi-k2.5");
				const { text, stopReason } = await client.prompt(sessionId, "Reply with exactly: ok");
				expect(
					stopReason,
					"Factory model call with FACTORY_API_KEY did not complete; if the gateway returned 401/403 the key is " +
						"invalid or revoked — provision a live key via OMP_E2E_API_KEY",
				).toBe("end_turn");
				expect(text.toLowerCase()).toContain("ok");
			} finally {
				await client.close();
			}
		},
		240_000,
	);
});

describe("model-call prerequisites", () => {
	test.skipIf(cliMissing || !GATES.modelCall)(
		"OMP_E2E_MODEL_CALL=1 requires an enabled credential source",
		() => {
			expect(
				GATES.oauth || GATES.apiKey !== undefined,
				"OMP_E2E_MODEL_CALL=1 makes a live Factory request but no credential tier is enabled: " +
					"set OMP_E2E_OAUTH=1 (uses the source DB's Factory OAuth) and/or OMP_E2E_API_KEY=fk-...",
			).toBe(true);
		},
	);
});
