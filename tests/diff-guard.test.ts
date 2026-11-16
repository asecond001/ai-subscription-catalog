import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  assembleCatalogDocument,
  loadProviderFiles,
} from "../src/builder.js";
import { computeCatalogContentHash } from "../src/hash.js";
import type { SubscriptionCatalogDocument } from "../src/types.js";
import { classifyCatalogDiff } from "../src/validator/diff-guard.js";

const ROOT_DIR = process.cwd();
const PROVIDERS_DIR = path.join(ROOT_DIR, "data", "providers");
const SCHEMA_PATH = path.join(
  ROOT_DIR,
  "schemas",
  "subscription-plans.schema.json"
);

function cloneCatalog(
  doc: SubscriptionCatalogDocument
): SubscriptionCatalogDocument {
  return JSON.parse(JSON.stringify(doc)) as SubscriptionCatalogDocument;
}

function refreshStatsAndHash(doc: SubscriptionCatalogDocument): void {
  doc.stats = {
    provider_count: doc.providers.length,
    plan_count: doc.plans.length,
    active_plan_count: doc.plans.filter((p) => p.status === "active").length,
    tokentracker_template_count: doc.plans.filter((p) => p.status === "active")
      .length,
  };
  doc.content_hash = computeCatalogContentHash({
    schema_version: doc.schema_version,
    providers: doc.providers,
    plans: doc.plans,
  });
}

test("diff-guard classifies unchanged, safe_minor_update, requires_review, and rejected accurately", async () => {
  const providerFiles = await loadProviderFiles(PROVIDERS_DIR);
  const { catalog: base } = assembleCatalogDocument(providerFiles, {
    generatedAt: "2026-11-16T00:00:00.000Z",
  });

  // 1. unchanged
  const unchanged = await classifyCatalogDiff(base, cloneCatalog(base), {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(unchanged.classification, "unchanged");

  // 2. safe_minor_update ($19.99 -> $21.99, +10%, <= $50, 1 plan)
  const minor = cloneCatalog(base);
  const agPro = minor.plans.find((p) => p.template_id === "google_ai_pro")!;
  agPro.billing.monthly_usd = 21.99;
  agPro.monthly_fee_micro_usd = 21_990_000;
  refreshStatsAndHash(minor);
  const resMinor = await classifyCatalogDiff(base, minor, {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(resMinor.classification, "safe_minor_update");
  assert.equal(resMinor.changes.length, 1);

  // 3. requires_review: >35% price jump ($20 -> $30, +50%)
  const bigJump = cloneCatalog(base);
  const claudePro = bigJump.plans.find((p) => p.template_id === "claude_pro")!;
  claudePro.billing.monthly_usd = 30;
  claudePro.monthly_fee_micro_usd = 30_000_000;
  refreshStatsAndHash(bigJump);
  const resJump = await classifyCatalogDiff(base, bigJump, {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(resJump.classification, "requires_review");
  assert.ok(resJump.reasons.some((r) => r.includes("35%")));

  // 4. requires_review: paid plan dropped to $0
  const zeroDrop = cloneCatalog(base);
  const cursorPremium = zeroDrop.plans.find(
    (p) => p.template_id === "cursor_premium"
  )!;
  cursorPremium.billing.monthly_usd = 0;
  cursorPremium.monthly_fee_micro_usd = 0;
  refreshStatsAndHash(zeroDrop);
  const resZero = await classifyCatalogDiff(base, zeroDrop, {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(resZero.classification, "requires_review");
  assert.ok(resZero.reasons.some((r) => r.includes("dropped to $0")));

  // 5. requires_review: plan removal (non-core plan)
  const removed = cloneCatalog(base);
  removed.plans = removed.plans.filter(
    (p) => p.template_id !== "cursor_pro_legacy"
  );
  refreshStatsAndHash(removed);
  const resRemoved = await classifyCatalogDiff(base, removed, {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(resRemoved.classification, "requires_review");
  assert.ok(resRemoved.reasons.some((r) => r.includes("Plan removed")));

  // 6. rejected: missing required TokenTracker v0.2.4 plan
  const rejected = cloneCatalog(base);
  rejected.plans = rejected.plans.filter((p) => p.template_id !== "claude_pro");
  refreshStatsAndHash(rejected);
  const resRejected = await classifyCatalogDiff(base, rejected, {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(resRejected.classification, "rejected");
});
