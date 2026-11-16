# AI Subscription Catalog

An open, versioned, machine-readable JSON catalog of **AI coding subscription plans, pricing tiers, and rolling/periodic quota windows** — complete with unattended daily vendor synchronization, dual-gate sanity checks, and a flat static catalog explorer.

- **Web Explorer**: <https://asecond001.github.io/ai-subscription-catalog/>
- **Repository**: <https://github.com/asecond001/ai-subscription-catalog>
- **License**: MIT

---

## Why This Exists

Open-source registries such as `models.dev` and `LiteLLM` maintain per-token API pricing, but **no standard machine-readable catalog existed for flat-rate AI coding subscriptions** and their multi-window rate limits (`5h` rolling, `24h` daily, `7d` weekly, `30d` monthly).

`ai-subscription-catalog` fills that gap for desktop/mobile usage trackers (including [TokenTracker](https://github.com/asecond001/TokenTracker)) with:

1. **100% Lossless `TokenTracker` `v0.2.4` Compatibility**: Preserves all **23** built-in `TokenTracker` templates across 7 providers (`claude_code`, `codex`, `antigravity`, `kimi_code`, `minimax_code`, `qcode`, `workbuddy`), plus extended mainstream AI coding IDEs & agents (`cursor`, `github_copilot`, `windsurf`) and newer OpenAI Pro tiers (`codex_pro_100`, `codex_pro_500`) — **10 providers, 41 plans total** (`40` active, `1` legacy).
2. **Zero-Key Static Endpoints**: Distributed via GitHub Pages, jsDelivr CDN, and GitHub Raw with deterministic `content_hash` values so clients can skip unchanged reloads.
3. **Dual-Gate Unattended Sync**: Daily GitHub Actions cron fetches public vendor pricing pages respectfully (immediately halting on `403`/`429`/Cloudflare challenges), validates every change against JSON Schema Draft 2020-12 + domain invariants, and routes anomalous or structural shifts (`>35%` price jump, paid dropping to zero, added/removed plans) to a review PR instead of auto-merging.

---

## Public Endpoints

| Feed | URL | Format |
| :--- | :--- | :--- |
| **GitHub Pages (Full Catalog)** | `https://asecond001.github.io/ai-subscription-catalog/v1/plans.json` | Versioned `SubscriptionCatalogDocument` |
| **GitHub Pages (TokenTracker DTO)** | `https://asecond001.github.io/ai-subscription-catalog/v1/tokentracker-templates.json` | Direct `SubscriptionPlanTemplate[]` array |
| **GitHub Pages (Providers)** | `https://asecond001.github.io/ai-subscription-catalog/v1/providers.json` | Provider index metadata |
| **jsDelivr CDN (Full Catalog)** | `https://cdn.jsdelivr.net/gh/asecond001/ai-subscription-catalog@main/catalog/subscription-plans.json` | Versioned `SubscriptionCatalogDocument` |
| **GitHub Raw (Full Catalog)** | `https://raw.githubusercontent.com/asecond001/ai-subscription-catalog/main/catalog/subscription-plans.json` | Versioned `SubscriptionCatalogDocument` |
| **GitHub Raw (TokenTracker DTO)** | `https://raw.githubusercontent.com/asecond001/ai-subscription-catalog/main/catalog/tokentracker-templates.json` | Direct `SubscriptionPlanTemplate[]` array |
| **JSON Schema (Draft 2020-12)** | `https://asecond001.github.io/ai-subscription-catalog/schemas/subscription-plans.schema.json` | JSON Schema |

---

## Covered Providers (10 Providers · 41 Plans)

| Provider ID | Display Name | Plans | Quota Windows | Provenance / Modes |
| :--- | :--- | ---: | :--- | :--- |
| `claude_code` | Claude Code (Anthropic) | 4 | `5h` rolling, `7d` weekly, `30d` monthly | `local_log`, `otlp`, `local_estimation` |
| `codex` | Codex / ChatGPT (OpenAI) | 5 | `5h` rolling, `7d` weekly | `local_log`, `otlp`, `local_estimation` |
| `antigravity` | Antigravity / Google AI | 6 | `5h` rolling, `7d` weekly | `local_log`, `local_estimation` |
| `kimi_code` | Kimi Code (Moonshot AI) | 4 | `5h` rolling, `7d` weekly, `30d` monthly | `official_api`, `local_log`, `local_estimation` |
| `minimax_code` | MiniMax Code | 3 | `5h` rolling, `7d` weekly, `30d` monthly (`micro_usd` & `tokens`) | `official_api`, `local_log`, `local_estimation` |
| `qcode` | QCode | 2 | `24h` daily, `30d` monthly | `official_api`, `local_log`, `local_estimation` |
| `workbuddy` | Workbuddy | 1 | `5h` rolling, `30d` monthly | `local_log`, `local_estimation` |
| `cursor` | Cursor | 6 | `7d` weekly, `30d` monthly (incl. legacy Pro) | `local_estimation` |
| `github_copilot` | GitHub Copilot | 6 | `30d` monthly (AI Credits: `0.01 USD/credit`) | `local_estimation` |
| `windsurf` | Windsurf | 4 | `24h` daily, `7d` weekly | `local_estimation` |

---

## Consuming in `TokenTracker` (Rust)

`catalog/tokentracker-templates.json` deserializes directly into `Vec<SubscriptionPlanTemplate>` in `crates/tokentracker-core`:

```rust
use tokentracker_core::domain::SubscriptionPlanTemplate;

pub fn parse_remote_subscription_templates(
    raw_json: &str,
) -> Result<Vec<SubscriptionPlanTemplate>, serde_json::Error> {
    let templates: Vec<SubscriptionPlanTemplate> = serde_json::from_str(raw_json)?;
    Ok(templates)
}
```

For full metadata (`content_hash`, `billing`, `verification`, `providers`), deserialize `catalog/subscription-plans.json` and read `.plans` (every `CatalogPlanEntry` is a strict superset of `SubscriptionPlanTemplate`).

---

## Local Development

Requires **Node.js >= 22** and **pnpm**.

```bash
pnpm install
pnpm run build       # Rebuilds catalog/*.json, validates schema/invariants, emits dist/
pnpm run typecheck   # Strict TypeScript check
pnpm test            # Runs all unit & integration tests via node --test
pnpm run sync:live -- --dry-run   # Exercises live vendor collectors without modifying repo files
```

### Contributing Plan Updates

1. Edit the provider file under `data/providers/<provider_id>.json`.
2. Run `pnpm run build && pnpm test` to regenerate `catalog/*.json` and verify all schema, `TokenTracker` compatibility, and diff-guard checks.
3. Submit a pull request; CI validates deterministic rebuilds automatically.
