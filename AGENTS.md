# AGENTS.md

Factory.ai provider extension for Oh My Pi (omp). TypeScript ESM, runs on Bun.
Entry point: `src/index.ts` (registers the `factory` provider with omp).

## Build / run

```sh
bun install
```

There is no build step. omp loads `src/index.ts` directly via the package
`extensions` field. To link into omp for local testing:

```sh
omp plugin link "$PWD"
omp models find factory
```

## Test

```sh
bun test src/ tools/        # unit tests (script: bun test)
bun run typecheck           # tsc --noEmit
bun run test:e2e            # gated e2e, see below
```
- `bun run capture:contract` recaptures the Droid system-prompt contract
  (writes to gitignored `.contract/`; use a disposable fake gateway, never
  commit artifacts — see `tools/capture-contract.ts`).

- Tests are colocated with source as `*.test.ts`. Test runner is `bun test`.
- E2E (`e2e/cli.e2e.ts`) drives the real omp CLI against an isolated profile
  and is gated by env vars: `OMP_E2E_OAUTH=1`, `OMP_E2E_API_KEY=fk-...`,
  `OMP_E2E_MODEL_CALL=1` (real model spend). Default runs skip live tiers.
- Known current state (2026-09-15): `src/model-refresh.test.ts` has 1 failing
  test (parseFactoryModelDocs keeps new families) and `typecheck` fails on
  `usageProvider` / `notes` typings against the installed pi peer deps. Fix or
  update these when touching catalog/usage code; do not add new failures.

## Conventions

- TypeScript `strict`, ES2024, module ESNext / moduleResolution Bundler
  (`tsconfig.json` covers `src`, `e2e`, `tools`).
- Style: 2-space indent, double quotes, no semicolons, tabs not used. Match
  surrounding code; no formatter config exists, do not add one.
- Avoid explicit return types unless they aid readability. No `as any`.
- Secrets: never log or print tokens, credentials, or auth DB contents
  (`e2e/harness.ts` treats credential JSON as opaque for a reason).
- `contract/` holds captured Droid system-prompt contract JSON (tracked).
  `.contract/` is gitignored capture scratch and must never be committed.
- Pricing in `src/catalog.ts` is the upstream USD/Mtok price multiplied by the
  Factory docs multiplier, rounded via `toPrecision(6)`.
- When adding a Factory model or updating an existing model, update the
  upstream pricing table, `FACTORY_DOCS_MULTIPLIERS`, and `MODEL_SIZES`
  together, then add or update a focused cost regression test. Do not rely on
  the default multiplier of `1` unless Factory's docs explicitly specify `1×`.
- Provider registration is deliberately split into two `registerProvider`
  calls (curated overlay + dynamic discovery); omp returns early on non-empty
  model lists, so a single combined config silently disables discovery. Keep
  the split.
- Docs that matter: `README.md` (user-facing routing/auth/env vars),
  `docs/interactive-capture-retrospective.md` (how the 403 system-prompt gate
  was diagnosed and why the system prompt is folded into the first user turn),
  `docs/security-review.md`.
