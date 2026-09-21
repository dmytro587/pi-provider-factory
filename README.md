# Pi Provider Factory

**Pi Provider Factory is an Oh My Pi provider extension for using Factory.ai Droid models from `omp`, including Claude Opus, Claude Sonnet, Claude Fable, GPT, Codex, Grok, Gemini, GLM, Kimi, DeepSeek, MiniMax, Nemotron, and Inkling models through Factory's authenticated LLM gateway.**

Last updated: 2026-09-17

## What this package does

This package registers a custom `factory` provider for [Oh My Pi](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent). It mirrors Factory Droid's authentication and request routing so `omp` can call Factory-hosted models with either Factory browser OAuth or a Factory API key.

Use it when you want:

- Factory.ai model access inside `omp`
- Droid-style Factory OAuth device login at `https://auth.factory.ai/device`
- Factory-routed Claude, GPT, Codex, Grok, Gemini, and open-weight coding models
- Region-aware Factory API routing, including EU residency endpoints
- One provider namespace for Factory models such as `factory/claude-opus-4-8` and `factory/gpt-5.5`

## Supported models

The extension ships a 52-model static catalog, force-refreshes Factory's public model docs and live `/api/feature-flags` routing map when an `omp` session starts, and merges any additional routeable model IDs those sources list. The lists below include every model in the shipped catalog plus the additional IDs currently returned by Factory's live sources. Live-only IDs can change as Factory's catalog and deprecation schedule change. `qwen3.8-max` is omitted because this provider does not currently route `qwen-*` IDs.

### Claude and Anthropic-family models

These models route through Factory's Anthropic-compatible gateway:

- `claude-opus-5`
- `claude-opus-5-fast`
- `claude-fable-5.1`
- `claude-opus-4-8`
- `claude-opus-4-8-fast`
- `claude-opus-4-7`
- `claude-opus-4-7-fast`
- `claude-opus-4-6`
- `claude-opus-4-6-fast`
- `claude-sonnet-5`
- `claude-sonnet-4-6`
- `claude-opus-4-5-20251101`
- `claude-fable-5`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`

### GPT and Codex models

These models route through Factory's OpenAI Responses-compatible gateway:

- `gpt-5.6-sol`
- `gpt-5.6-sol-fast`
- `gpt-5.6-terra`
- `gpt-5.6-luna`
- `gpt-5.5`
- `gpt-5.5-fast`
- `gpt-5.5-pro`
- `gpt-5.4`
- `gpt-5.4-fast`
- `gpt-5.4-mini`
- `gpt-5.4-mini-fast`
- `gpt-5.3-codex`
- `gpt-5.3-codex-fast`
- `gpt-5.2`

### Grok models

These models use Factory's OpenAI Responses-compatible gateway with `x-api-provider: xai`:

- `grok-4.6`
- `grok-4.5`

### Gemini models

These models use Factory's OpenAI Chat Completions-compatible gateway with `x-api-provider: google`:

- `gemini-3.1-pro-preview`
- `gemini-3.7-flash`
- `gemini-3.6-flash`
- `gemini-3.5-flash`
- `gemini-3-flash-preview`

### Factory Core and open-weight chat models

These models use Factory's OpenAI Chat Completions-compatible gateway with `x-api-provider: fireworks`, except MiniMax, which uses the Anthropic-compatible wire API:

- `glm-5.3-flash`
- `glm-5.3`
- `glm-5.2`
- `glm-5.2-fast`
- `glm-5.1`
- `kimi-k3`
- `kimi-k2.7-code`
- `kimi-k2.6`
- `kimi-k2.5`
- `deepseek-v4-pro`
- `deepseek-v4-flash-0731`
- `inkling`
- `minimax-m3`
- `minimax-m2.7`
- `minimax-m2.5`
- `nemotron-3-ultra`

### Additional live-discovered models

Factory's current model docs and `/api/feature-flags` routing map also return these routeable IDs. They are added after a live catalog refresh rather than shipped in the static overlay:

- `gpt-6-astra`
- `gpt-5-2025-08-07`
- `gpt-5.1`
- `gemini-3.8-flash`
- `deepseek-v4.1-flash`

The live routing map still advertises these deprecated GPT IDs, so discovery can expose them until Factory removes them:

- `gpt-5-codex`
- `gpt-5.1-codex`
- `gpt-5.2-codex`

The dynamic catalog is limited to model IDs whose family the provider can route. Factory may list other models, such as `qwen3.8-max`, that are not supported by this extension.

## Request routing

Factory model requests go to Factory's LLM gateway. The default base URL is:

```text
https://api.factory.ai
```

OAuth credentials may provide a region-specific `apiEndpoint`, such as:

```text
https://api.eu.factory.ai
```

`FACTORY_API_BASE` overrides both the default host and any OAuth-provided `apiEndpoint`; this is useful for testing, proxies, or controlled environments.

| Model family | Base path | Wire API | Header |
| --- | --- | --- | --- |
| Claude / Anthropic | `${apiEndpoint}/api/llm/a` | Anthropic Messages `/v1/messages` | `x-api-provider: anthropic` |
| GPT / Codex | `${apiEndpoint}/api/llm/o/v1` | OpenAI Responses `/responses` | `x-api-provider: openai` |
| Grok | `${apiEndpoint}/api/llm/o/v1` | OpenAI Responses `/responses` | `x-api-provider: xai` |
| Gemini | `${apiEndpoint}/api/llm/o/v1` | OpenAI Chat Completions `/chat/completions` | `x-api-provider: google` |
| GLM / Kimi / DeepSeek / Nemotron / Inkling | `${apiEndpoint}/api/llm/o/v1` | OpenAI Chat Completions `/chat/completions` | `x-api-provider: fireworks` |
| MiniMax | `${apiEndpoint}/api/llm/a` | Anthropic Messages `/v1/messages` | `x-api-provider: fireworks` |

Examples:

```text
factory/claude-opus-4-8
→ https://api.factory.ai/api/llm/a/v1/messages

factory/gpt-5.5
→ https://api.factory.ai/api/llm/o/v1/responses

factory/glm-5.1
→ https://api.factory.ai/api/llm/o/v1/chat/completions
```

The extension also sends Droid-compatible Factory headers, including `X-Factory-Client`, `X-Client-Version`, `X-Factory-Org-Id`, `x-session-id`, `x-assistant-message-id`, and the appropriate `x-api-provider` value.

## Installation

Install dependencies with Bun:

```zsh
bun install
```

Link the extension into `omp`:

```zsh
omp plugin link "$PWD"
```

Confirm the provider is discoverable:

```zsh
omp models find factory
```

Force a fresh Factory catalog fetch at any time:

```zsh
omp models refresh factory
```

This pulls Factory's public model docs for newly supported model IDs. If the docs fetch fails, the last successfully cached catalog is retained and the fetch is retried automatically — roughly every 5 minutes and at each session start.

## Authentication

### Browser OAuth, recommended

Run `omp`, log in to the Factory provider, and leave the API-key prompt blank:

```text
/login factory
```

The extension opens Factory's Droid device login URL:

```text
https://auth.factory.ai/device
```

After successful login, the extension stores refreshable OAuth credentials through Oh My Pi's normal provider auth storage.

### Factory API key

You can use a Factory API key by setting `FACTORY_API_KEY`:

```zsh
export FACTORY_API_KEY="fk-..."
```

When `FACTORY_API_KEY` is present, Oh My Pi treats it as the provider API key source. If you want to test OAuth instead, unset it first:

```zsh
unset FACTORY_API_KEY
```

Billing-limit reporting (`/usage`) is OAuth-only; API-key sessions never query it (see below).

## Usage reporting

Native `/usage` reports Factory account quotas for OAuth accounts. The extension queries `GET {apiEndpoint}/api/billing/limits` with the OAuth bearer and Droid-compatible headers, and renders:

- Standard 5-hour, weekly, and monthly windows
- Droid Core 5-hour, weekly, and monthly windows — inactive pools are shown explicitly as having no active window instead of looking like available quota
- Extra Usage balance as a remaining dollar amount, with eligibility and overage-preference notes

Queries use the same base-URL precedence as model routing (`FACTORY_API_BASE`, then the OAuth credential's region-specific `apiEndpoint`, then `https://api.factory.ai`) and reuse Oh My Pi's normal usage cache window and history recording.

The billing-limits endpoint is queried with OAuth credentials only. Factory `fk-...` API keys are intentionally never sent to it (a live probe returns `401`), so with only `FACTORY_API_KEY` configured, model calls still work but `/usage` shows no Factory billing limits by design.

Usage-provider registration for extensions requires an Oh My Pi release that includes it; on older releases Factory simply does not appear in `/usage` while model routing is unaffected.

### Organization and region handling

Factory's gateway requires an organization-scoped bearer token or an organization header. This extension derives the Factory organization ID from OAuth JWT claims or `/api/cli/whoami`, and it can recover WorkOS organization scope during refresh.

OAuth login and refresh support:

- WorkOS device authorization
- Organization-scoped token refresh
- Factory org ID extraction for `X-Factory-Org-Id`
- Region discovery via `/api/cli/whoami`
- Region-to-base-URL mapping, including `eu` → `https://api.eu.factory.ai`

## Environment variables

| Variable | Purpose |
| --- | --- |
| `FACTORY_API_KEY` | Optional Factory `fk-...` API key. Takes precedence over OAuth in normal provider resolution. |
| `FACTORY_API_BASE` | Overrides the Factory API base URL for every request, including OAuth-discovered endpoints. |
| `FACTORY_ORG_ID` | Optional explicit Factory organization ID header value. |
| `FACTORY_ORGANIZATION_ID` | Alias for `FACTORY_ORG_ID`. |
| `FACTORY_UPSTREAM_CLIENT_TYPE` | Optional override for `X-Factory-Client`; defaults to `cli`. |

## Usage examples

> **Note:** `omp -p --model factory/<id>` does not currently work from a cold start: omp resolves `--model` before extension-provider catalogs hydrate, so factory models are only selectable in interactive mode. Tracked upstream in [oh-my-pi#4216](https://github.com/can1357/oh-my-pi/issues/4216).

Run a Factory model interactively:

```zsh
omp
```

Then select a model with the picker and prompt normally:

```text
/model
# filter for e.g. factory/claude-sonnet-5, Enter to select
reply with the single word ok
```

Any factory model works the same way, e.g. `factory/claude-opus-4-8`, `factory/gpt-5.5`, or `factory/glm-5.2`.

## Implementation notes

### Anthropic system prompt compatibility

Factory's Anthropic gateway rejects requests that use Anthropic's top-level `system` field. For Anthropic-family models only, this extension folds the system prompt into the first user turn before forwarding the request. OpenAI Responses and chat-completions routes keep their native prompt handling.

### API-key and OAuth credential formats

The router accepts either:

1. A raw bearer/API key string.
2. An OAuth credential envelope containing `access`, `orgId`, and `apiEndpoint`.

Raw OAuth JWTs are decoded locally only to derive non-secret routing metadata such as Factory org ID. Tokens are not logged or printed by the extension.

## Troubleshooting

### `No API key found for factory`

Run:

```text
/login factory
```

Then leave the `fk-...` prompt blank for browser OAuth, or paste a Factory API key.

### Factory login opens the wrong page

The expected OAuth URL is Factory's Droid device URL:

```text
https://auth.factory.ai/device
```

If you see a generic WorkOS authorize URL, relink this plugin and log in again:

```zsh
omp plugin link "$PWD"
omp
/logout factory
/login factory
```

### `403 Forbidden` from Factory

Most 403s are caused by one of these issues:

1. `FACTORY_API_KEY` is set and overriding OAuth credentials.
2. The OAuth token is not organization-scoped.
3. The request is missing `X-Factory-Org-Id`.
4. A non-droid system prompt was sent in the system field (Anthropic top-level `system`, OpenAI `instructions`, or a `system`-role message). Factory refuses non-droid system content on **every** route; the extension avoids this by folding the system prompt into the first user message.
5. The wrong regional endpoint is being used.

If `/api/cli/whoami` works but LLM calls still return `403 {"detail":"Forbidden",...}`, the credential is valid but Factory's LLM gateway is refusing that model/org request. Check Factory model entitlement for the org shown by the plugin diagnostic, then unset local overrides and re-login.

Start with a clean OAuth run:

```zsh
unset FACTORY_API_KEY FACTORY_ORG_ID FACTORY_ORGANIZATION_ID FACTORY_API_BASE
omp
/logout factory
/login factory
/model factory/claude-opus-4-8
```

Then test:

```text
reply with the single word ok
```

## FAQ

### What is Pi Provider Factory?

Pi Provider Factory is an Oh My Pi extension that adds a `factory` provider for Factory.ai's Droid LLM gateway. It lets `omp` use Factory-routed Claude, GPT, Codex, Grok, Gemini, and open-weight coding models with Droid-compatible OAuth and request headers.

### Does this call Anthropic or OpenAI directly?

No. Requests go to Factory's gateway first. Factory then routes each request to the appropriate upstream family based on model ID and the `x-api-provider` header.

### Which endpoint does `factory/claude-opus-4-8` use?

`factory/claude-opus-4-8` uses Factory's Anthropic-compatible endpoint: `${apiEndpoint}/api/llm/a/v1/messages`. By default, that is `https://api.factory.ai/api/llm/a/v1/messages`.

### Which endpoint does `factory/gpt-5.5` use?

`factory/gpt-5.5` uses Factory's OpenAI Responses-compatible endpoint: `${apiEndpoint}/api/llm/o/v1/responses`.

### Which endpoint do Factory Core models use?

Most Factory Core open-weight models, including GLM, Kimi, DeepSeek, Inkling, and Nemotron, use `${apiEndpoint}/api/llm/o/v1/chat/completions`. MiniMax models (`minimax-m3`, `minimax-m2.7`, `minimax-m2.5`) are the exception: Factory serves them through the Anthropic-compatible endpoint `${apiEndpoint}/api/llm/a/v1/messages`. Every Factory Core model sends `x-api-provider: fireworks`.

### What `x-api-provider` value does each request send?

Factory's gateway routes by the `x-api-provider` request header, which names the upstream and is independent of the API shape. Values are taken from observed `droid` CLI traffic:

- `anthropic`, Claude models (Anthropic endpoint)
- `openai`, GPT and Codex models (OpenAI Responses endpoint)
- `xai`, Grok models (OpenAI Responses endpoint)
- `google`, Gemini models (OpenAI Chat Completions endpoint)
- `fireworks`, all Droid Core open models (GLM, Kimi, DeepSeek, MiniMax, Nemotron, and Inkling), including MiniMax, which is served over the Anthropic API shape

Sending the wrong value, for example `factory` for an open model, makes the gateway reject the request with `400 {"detail":"Invalid x-api-provider header"}`.

### How does the extension handle system prompts?

Factory's gateway enforces a client-attestation gate: it only accepts a request whose system field carries droid's own system prompt as a prefix. Any other system content — an Anthropic top-level `system`, an OpenAI `instructions` string, or a `system`-role chat message — is refused with `403 {"detail":"Forbidden",...}` on every route. A request with no system field is always accepted.

Because Oh My Pi sends its own system prompt (not droid's), the extension folds that prompt into the first user message — wrapped in `<system>…</system>` — and leaves the system field empty. This delivers the instructions to the model while satisfying the gate, and avoids bundling droid's proprietary prompt or injecting a conflicting "You are Droid" identity. The fold is applied on all three routes.

## Development

Run the TypeScript compiler:

```zsh
bunx tsc --noEmit
```

Run a live smoke test after authenticating — use interactive mode ([oh-my-pi#4216](https://github.com/can1357/oh-my-pi/issues/4216) blocks `-p --model factory/...`):

```zsh
unset FACTORY_API_KEY FACTORY_ORG_ID FACTORY_ORGANIZATION_ID FACTORY_API_BASE
omp
# /model → select factory/claude-opus-4-8 → prompt: reply with the single word ok
```

Expected output:

```text
ok
```
