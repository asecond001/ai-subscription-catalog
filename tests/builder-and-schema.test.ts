import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  assembleCatalogDocument,
  loadProviderFiles,
} from "../src/builder.js";
import { computeCatalogContentHash } from "../src/hash.js";
import type { SubscriptionCatalogDocument } from "../src/types.js";
import { validateCatalog } from "../src/validator/schema-validator.js";

const ROOT_DIR = process.cwd();
const PROVIDERS_DIR = path.join(ROOT_DIR, "data", "providers");
const SCHEMA_PATH = path.join(
  ROOT_DIR,
  "schemas",
  "subscription-plans.schema.json"
);

function cloneCatalog(
  catalog: SubscriptionCatalogDocument
): SubscriptionCatalogDocument {
  return JSON.parse(JSON.stringify(catalog)) as SubscriptionCatalogDocument;
}

function recomputeHash(catalog: SubscriptionCatalogDocument): void {
  catalog.content_hash = computeCatalogContentHash({
    schema_version: catalog.schema_version,
    providers: catalog.providers,
    plans: catalog.plans,
  });
}

test("builder generates deterministic hash and preserves generated_at when unchanged", async () => {
  const providerFiles = await loadProviderFiles(PROVIDERS_DIR);

  const first = assembleCatalogDocument(providerFiles, {
    generatedAt: "2026-11-16T00:00:00.000Z",
  });
  const second = assembleCatalogDocument(providerFiles, {
    generatedAt: "2026-11-17T12:34:56.000Z",
    previousCatalog: first.catalog,
  });

  assert.equal(first.catalog.content_hash, second.catalog.content_hash);
  assert.equal(second.catalog.generated_at, "2026-11-16T00:00:00.000Z");

  const validation = await validateCatalog(first.catalog, {
    schemaPath: SCHEMA_PATH,
    templates: first.templates,
  });
  assert.equal(
    validation.valid,
    true,
    `Expected valid catalog, got errors: ${validation.errors.join("; ")}`
  );
});

test("committed catalog files match rebuild and pass validation", async () => {
  const rawCatalog = await readFile(
    path.join(ROOT_DIR, "catalog", "subscription-plans.json"),
    "utf8"
  );
  const catalog = JSON.parse(rawCatalog) as SubscriptionCatalogDocument;
  const validation = await validateCatalog(catalog, { schemaPath: SCHEMA_PATH });
  assert.equal(validation.valid, true, validation.errors.join("; "));
});

test("schema validator rejects negative fee, monthly_usd mismatch, and bad alert thresholds", async () => {
  const providerFiles = await loadProviderFiles(PROVIDERS_DIR);
  const { catalog: baseline } = assembleCatalogDocument(providerFiles, {
    generatedAt: "2026-11-16T00:00:00.000Z",
  });

  // 1. Negative monthly fee
  const negFee = cloneCatalog(baseline);
  negFee.plans[0]!.monthly_fee_micro_usd = -100;
  recomputeHash(negFee);
  const resNeg = await validateCatalog(negFee, { schemaPath: SCHEMA_PATH });
  assert.equal(resNeg.valid, false);

  // 2. monthly_usd vs monthly_fee_micro_usd mismatch
  const mismatch = cloneCatalog(baseline);
  mismatch.plans[0]!.billing.monthly_usd = 99;
  recomputeHash(mismatch);
  const resMismatch = await validateCatalog(mismatch, {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(resMismatch.valid, false);
  assert.ok(
    resMismatch.errors.some((e) => e.includes("does not match monthly_fee_micro_usd"))
  );

  // 3. warning_percent >= critical_percent
  const badAlert = cloneCatalog(baseline);
  badAlert.plans[0]!.windows[0]!.warning_percent = 95;
  badAlert.plans[0]!.windows[0]!.critical_percent = 90;
  recomputeHash(badAlert);
  const resAlert = await validateCatalog(badAlert, { schemaPath: SCHEMA_PATH });
  assert.equal(resAlert.valid, false);
  assert.ok(
    resAlert.errors.some((e) => e.includes("alert thresholds invalid"))
  );

  // 4. Kimi plan missing 30d window
  const kimiBroken = cloneCatalog(baseline);
  const kimiPlan = kimiBroken.plans.find((p) => p.provider_id === "kimi_code")!;
  kimiPlan.windows = kimiPlan.windows.filter((w) => w.window_id !== "30d");
  recomputeHash(kimiBroken);
  const resKimi = await validateCatalog(kimiBroken, {
    schemaPath: SCHEMA_PATH,
  });
  assert.equal(resKimi.valid, false);
  assert.ok(resKimi.errors.some((e) => e.includes("30d")));
});
