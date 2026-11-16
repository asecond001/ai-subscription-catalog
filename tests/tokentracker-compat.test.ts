import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  REQUIRED_TOKENTRACKER_TEMPLATE_IDS,
  type SubscriptionCatalogDocument,
  type TokenTrackerPlanTemplate,
} from "../src/types.js";

const ROOT_DIR = process.cwd();

const CORE_FREE_TEMPLATE_IDS = new Set(["google_ai_free"]);

test("tokentracker-templates.json preserves all 23 v0.2.4 templates in exact Rust DTO format", async () => {
  const templatesRaw = await readFile(
    path.join(ROOT_DIR, "catalog", "tokentracker-templates.json"),
    "utf8"
  );
  const templates = JSON.parse(templatesRaw) as TokenTrackerPlanTemplate[];

  const catalogRaw = await readFile(
    path.join(ROOT_DIR, "catalog", "subscription-plans.json"),
    "utf8"
  );
  const catalog = JSON.parse(catalogRaw) as SubscriptionCatalogDocument;

  assert.equal(templates.length, catalog.stats.tokentracker_template_count);
  assert.ok(templates.length >= 23);

  // First 23 entries match TokenTracker v0.2.4 exact sequence
  const first23Ids = templates.slice(0, 23).map((t) => t.template_id);
  assert.deepEqual(first23Ids, [...REQUIRED_TOKENTRACKER_TEMPLATE_IDS]);

  // Every entry strictly matches SubscriptionPlanTemplate wire fields (6 fields)
  const expectedKeys = [
    "description",
    "monthly_fee_micro_usd",
    "plan_name",
    "provider_id",
    "template_id",
    "windows",
  ];
  for (const tpl of templates) {
    assert.deepEqual(Object.keys(tpl).sort(), expectedKeys);
    assert.ok(
      Number.isInteger(tpl.monthly_fee_micro_usd) &&
        tpl.monthly_fee_micro_usd >= 0
    );
  }

  // Paid core templates remain > 0 and google_ai_free remains 0
  for (const id of REQUIRED_TOKENTRACKER_TEMPLATE_IDS) {
    const match = templates.find((t) => t.template_id === id);
    assert.ok(match, `Missing template ${id}`);
    if (CORE_FREE_TEMPLATE_IDS.has(id)) {
      assert.equal(match.monthly_fee_micro_usd, 0);
    } else {
      assert.ok(
        match.monthly_fee_micro_usd > 0,
        `Core paid template ${id} must have positive fee`
      );
    }
  }

  // Kimi templates all include 30d window
  for (const kimi of templates.filter((t) => t.provider_id === "kimi_code")) {
    assert.ok(
      kimi.windows.some((w) => w.window_id === "30d"),
      `Kimi template ${kimi.template_id} missing 30d window`
    );
  }

  // MiniMax Token Plan uses tokens unit (20M 5h / 120M 30d)
  const mmToken = templates.find(
    (t) => t.template_id === "minimax_token_plan"
  );
  assert.ok(mmToken);
  assert.equal(mmToken.windows[0]?.unit, "tokens");
  assert.equal(mmToken.windows[0]?.limit_value, 20_000_000);
  assert.equal(mmToken.windows[1]?.unit, "tokens");
  assert.equal(mmToken.windows[1]?.limit_value, 120_000_000);

  // Catalog tags v0.2.4 templates explicitly
  const taggedCount = catalog.plans.filter((p) =>
    p.compatibility_tags.includes("tokentracker-v0.2.4")
  ).length;
  assert.equal(taggedCount, 23);
});
