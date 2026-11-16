# Architecture (`ai-subscription-catalog`)

Current real-time snapshot of the repository structure, build pipeline, validation gates, and GitHub Actions automation.

## 1. Repository Layout

- `data/providers/*.json` — Modular per-provider source definitions (`claude_code`, `codex`, `antigravity`, `kimi_code`, `minimax_code`, `qcode`, `workbuddy`, `cursor`, `github_copilot`, `windsurf`).
- `schemas/subscription-plans.schema.json` — JSON Schema Draft 2020-12 contract validating the generated catalog.
- `catalog/subscription-plans.json` — Built canonical catalog document (10 providers, 41 plans, 40 active plans).
- `catalog/tokentracker-templates.json` — Built `SubscriptionPlanTemplate[]` array for direct deserialization in `TokenTracker`.
- `src/types.ts` — Shared TypeScript interfaces and the locked 23 `REQUIRED_TOKENTRACKER_TEMPLATE_IDS` sequence.
- `src/hash.ts` — Canonical sorted-key SHA-256 `content_hash` generator (excludes `generated_at`).
- `src/builder.ts` — Loads `data/providers/*.json`, builds `SubscriptionCatalogDocument` and `TokenTrackerPlanTemplate[]`, and preserves `generated_at` when `content_hash` is unchanged.
- `src/validator/schema-validator.ts` — Gate 1 (`validateCatalog`): Ajv Draft 2020-12 validation + domain invariants + `TokenTracker` `v0.2.4` ID lock.
- `src/validator/diff-guard.ts` — Gate 2 (`classifyCatalogDiff`): classifies diffs as `unchanged`, `safe_minor_update`, `requires_review`, or `rejected`, and formats Markdown diff summaries.
- `src/collectors/http.ts` — HTTP fetcher with 10s timeout, 4 MiB body cap, honest `User-Agent`, and immediate stop on `401`/`403`/`429`/`503` or Cloudflare/CAPTCHA challenge markers.
- `src/collectors/html-utils.ts` — Cheerio heading/card-scoped monthly USD extractor that separates monthly fees from annual-total (`.../yr`) or annual-discounted strings.
- `src/collectors/vendors/*.ts` — Vendor parsers for Anthropic, OpenAI, Google, Kimi, MiniMax, Cursor, GitHub Copilot, and Windsurf.
- `src/collectors/index.ts` — Concurrent vendor runner and high-confidence price updater.
- `src/site/build-site.ts` — Emits static `dist/` explorer (`index.html`, `subscription-plans.json`, `v1/plans.json`, `v1/tokentracker-templates.json`, `v1/providers.json`, `schemas/subscription-plans.schema.json`, `.nojekyll`).
- `src/cli/build-catalog.ts`, `src/cli/validate-catalog.ts`, `src/cli/sync-live.ts` — CLI entrypoints backing `package.json` scripts.
- `tests/` — Offline test suites (`builder-and-schema.test.ts`, `tokentracker-compat.test.ts`, `diff-guard.test.ts`, `collectors.test.ts`, `site-build.test.ts`) and HTML fixtures under `tests/fixtures/html/`.

## 2. Dual-Gate Automation Pipeline

```text
data/providers/*.json ──┐
                        ├──► src/builder.ts ──► Gate 1: schema-validator.ts
Live Vendor Collectors ─┘                               │
                                                        ▼
                                            Gate 2: diff-guard.ts
                                       ┌────────┼────────┬─────────┐
                                       ▼        ▼        ▼         ▼
                                   unchanged  safe_   requires_  rejected
                                    (no-op)   minor    review    (abort)
                                                │        │
                                                ▼        ▼
                                            push main  open PR
                                            + Pages    for review
```

## 3. GitHub Actions Workflows

- `.github/workflows/ci.yml`: Runs `typecheck`, `test`, `validate`, and `build:site` on PRs and pushes to `main`, and deploys `dist/` to GitHub Pages on `main`.
- `.github/workflows/auto-update.yml`: Scheduled daily at `04:17 UTC` (plus `workflow_dispatch` with optional `dry_run`), executes `pnpm run sync:live`, uploads `artifacts/sync-report.json`, auto-commits & deploys Pages on `safe_minor_update`, or opens/updates PR `automation/catalog-review` on `requires_review`.
