# AGENTS.md — AI Subscription Catalog Engineering Standards

This document defines the engineering standards, data compliance rules, and release gates for `ai-subscription-catalog`.

## 1. Project Mission

`ai-subscription-catalog` maintains an open, versioned, machine-readable JSON catalog of consumer and team AI coding subscription plans, monthly/annual fee baselines, and rolling/periodic quota windows. It serves as the upstream remote catalog for `TokenTracker` and other open-source AI cost/quota monitors.

## 2. Architecture & Data Flow

- **Source of Truth**: `data/providers/<provider_id>.json` (1 file per provider).
- **Schema Contract**: `schemas/subscription-plans.schema.json` (JSON Schema Draft 2020-12).
- **Generated Artifacts**:
  - `catalog/subscription-plans.json`: Full catalog document with `providers`, `plans`, `stats`, and deterministic `content_hash`.
  - `catalog/tokentracker-templates.json`: Flat `SubscriptionPlanTemplate[]` array preserving exact `TokenTracker` `v0.2.4` compatibility (23 core templates first, followed by extended active plans).
  - `dist/`: Static GitHub Pages web explorer and versioned JSON endpoints (`v1/plans.json`, `v1/tokentracker-templates.json`, `v1/providers.json`, `schemas/subscription-plans.schema.json`).

## 3. Compliance & Anti-Bot Redlines

1. **Public Unauthenticated Pages Only**: Collectors only fetch publicly documented vendor pricing and quota documentation pages using standard HTTP `GET` requests with an honest `User-Agent`.
2. **Immediate Stop on Anti-Bot / Rate Limits**: On HTTP `401`, `403`, `429`, `503` or any CAPTCHA / Cloudflare Turnstile challenge body, collectors MUST immediately return `challenged_or_blocked` and preserve the existing curated baseline. Never bypass CAPTCHAs, rotate proxies, spoof browsers, or scrape authenticated endpoints.
3. **Zero Fabricated Precision**: Distinguish official pricing (`official_page`), official quota/credit docs (`official_doc` / `official_credits`), and reference estimates (`reference_estimate`) explicitly via `verification`.

## 4. Dual-Gate Update Safety

1. **Gate 1 (`src/validator/schema-validator.ts`)**: Enforces JSON Schema Draft 2020-12, micro-USD consistency (`round(monthly_usd * 1_000_000) === monthly_fee_micro_usd`), window invariants, Kimi `30d` window rule, and preservation of all 23 `TokenTracker` `v0.2.4` template IDs.
2. **Gate 2 (`src/validator/diff-guard.ts`)**: Classifies updates into `unchanged`, `safe_minor_update`, `requires_review`, or `rejected`. Paid-to-zero drops, price changes over 35% or `50 USD`, plan additions/removals, window mutations, or batches over 3 modified plans MUST trigger a human-review PR rather than auto-merging to `main`.

## 5. TypeScript, UI & Verification Gates

- TypeScript `strict: true` with zero `any`.
- Web explorer (`src/site/build-site.ts`) must follow a flat, high-density tabular layout (`tabular-nums`, hairline `1px` borders, zero Bento card grids).
- Before any commit or completion, run `pnpm run typecheck`, `pnpm test`, `pnpm run validate`, and `pnpm run build:site`.
- Keep `docs/ARCHITECTURE.md` synchronized with actual files, scripts, and CI workflows.
